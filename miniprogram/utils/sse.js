/**
 * SSE 流式请求（wx.request enableChunked）
 * - 增量 UTF-8 解码（跨 chunk 多字节安全）
 * - 按 SSE 协议解析 data: {...} / data: [DONE]
 * 用于 LLM 对话（POST /llm/chat）
 */

/** 增量 UTF-8 解码器：push(Uint8Array) → 完整字符串（保留不完整序列） */
function createUtf8Decoder() {
  let pending = []; // 未消费的字节

  return {
    push(chunk) {
      const merged = pending.concat(Array.prototype.slice.call(chunk));
      pending = [];
      let s = "";
      let i = 0;
      const n = merged.length;
      while (i < n) {
        const b = merged[i];
        let cp = -1;
        let len = 1;
        if (b < 0x80) {
          cp = b;
        } else if (b < 0xe0) {
          len = 2;
          if (i + 1 < n) cp = ((b & 0x1f) << 6) | (merged[i + 1] & 0x3f);
        } else if (b < 0xf0) {
          len = 3;
          if (i + 2 < n) cp = ((b & 0x0f) << 12) | ((merged[i + 1] & 0x3f) << 6) | (merged[i + 2] & 0x3f);
        } else {
          len = 4;
          if (i + 3 < n)
            cp =
              ((b & 0x07) << 18) |
              ((merged[i + 1] & 0x3f) << 12) |
              ((merged[i + 2] & 0x3f) << 6) |
              (merged[i + 3] & 0x3f);
        }
        if (cp < 0) break; // 序列不完整，留到下个 chunk
        if (cp < 0x10000) {
          s += String.fromCharCode(cp);
        } else {
          const off = cp - 0x10000;
          s += String.fromCharCode(0xd800 + (off >> 10), 0xdc00 + (off & 0x3ff));
        }
        i += len;
      }
      pending = merged.slice(i);
      return s;
    },
    flush() {
      const rest = pending;
      pending = [];
      let s = "";
      rest.forEach((b) => (s += String.fromCharCode(b)));
      return s;
    }
  };
}

/**
 * SSE 事件切分器（与 wx.request 解耦，便于单测）
 * - 统一 CRLF / CR / LF 三种行尾（SSE 规范允许，部分网关会发 CRLF）
 * - 事件以空行分隔；跨 chunk 的 \r\n 也能正确拼接
 * @param {function(string)} onEvent 收到一条完整事件（原始文本）
 */
function createSseParser(onEvent) {
  let buffer = "";
  let pendingCR = false;

  function drain() {
    let idx;
    while ((idx = buffer.indexOf("\n\n")) >= 0) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (rawEvent.trim()) onEvent(rawEvent);
    }
  }

  return {
    push(chunk) {
      let text = String(chunk);
      if (pendingCR) {
        // 上一条事件的结尾 \r：补成 \n；若本块以 \n 开头（跨块 CRLF）则吞掉
        buffer += "\n";
        if (text.charAt(0) === "\n") text = text.slice(1);
        pendingCR = false;
      }
      if (text.charAt(text.length - 1) === "\r") {
        text = text.slice(0, -1);
        pendingCR = true;
      }
      buffer += text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      drain();
    },
    /** 流结束时处理没有以空行收尾的最后一条事件 */
    flush() {
      if (pendingCR) {
        buffer += "\n";
        pendingCR = false;
      }
      drain();
      if (buffer.trim()) {
        const rawEvent = buffer;
        buffer = "";
        onEvent(rawEvent);
      }
    }
  };
}

/**
 * 发起 SSE 流式请求
 * @param {object} opts
 * @param {string} opts.url
 * @param {object} opts.data        请求体
 * @param {string} opts.token       Bearer token
 * @param {function} opts.onData    每条 SSE data（已 JSON.parse 或原字符串）
 * @param {function} [opts.onDone]  流结束
 * @param {function} [opts.onError]
 * @returns {object} { abort }
 */
function sseRequest(opts) {
  const { url, data, token, onData, onDone, onError } = opts;
  const decoder = createUtf8Decoder();
  let done = false;
  const parser = createSseParser((rawEvent) => handleEvent(rawEvent));

  const task = wx.request({
    url,
    method: "POST",
    data,
    header: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
      Authorization: `Bearer ${token}`
    },
    enableChunked: true,
    timeout: 300000,
    responseType: "text",
    success(res) {
      if (done) return; // [DONE] 已触发过 onDone
      // 非流式降级：部分网关可能一次性返回
      if (res.statusCode !== 200) {
        done = true;
        const e = {
          statusCode: res.statusCode,
          message: (res.data && (res.data.error || res.data.message)) || `请求失败 (${res.statusCode})`
        };
        if (onError) onError(e);
        return;
      }
      if (res.data && typeof res.data === "string" && res.data.indexOf("data:") < 0) {
        try {
          onData(JSON.parse(res.data));
        } catch (err) {
          onData(res.data);
        }
      }
      // 处理没有以空行结尾的最后一条事件（可能含 data: [DONE]）
      parser.flush();
      if (done) return;
      done = true;
      if (onDone) onDone();
    },
    fail(err) {
      if (done) return;
      done = true;
      if (onError) onError({ statusCode: -1, message: err.errMsg || "连接失败" });
    }
  });

  if (task && task.onChunkReceived) {
    task.onChunkReceived((res) => {
      parser.push(decoder.push(new Uint8Array(res.data)));
    });
  }

  function handleEvent(rawEvent) {
    const lines = rawEvent.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.indexOf("data:") !== 0) continue;
      let payload = line.slice(5);
      if (payload.charAt(0) === " ") payload = payload.slice(1);
      if (payload === "[DONE]") {
        done = true;
        if (onDone) onDone();
        return;
      }
      let parsed = payload;
      try {
        parsed = JSON.parse(payload);
      } catch (e) {
        /* 保留原字符串 */
      }
      if (onData) onData(parsed);
    }
  }

  return {
    abort() {
      try {
        task.abort();
      } catch (e) {
        /* ignore */
      }
    }
  };
}

module.exports = { sseRequest, createUtf8Decoder, createSseParser };
