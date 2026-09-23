/**
 * 时间/状态格式化工具
 */

function pad(n) {
  return n < 10 ? `0${n}` : `${n}`;
}

/** ISO/时间戳 → YYYY-MM-DD HH:mm */
function formatDateTime(input) {
  if (!input) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

/** → YYYY-MM-DD */
function formatDate(input) {
  if (!input) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 相对时间（xx分钟前 等） */
function fromNow(input) {
  if (!input) return "";
  const d = new Date(input);
  if (isNaN(d.getTime())) return String(input);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "刚刚";
  if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)} 天前`;
  return formatDate(input);
}

/** 赛事状态：not_started / ongoing / finished */
function contestStatus(startDate, endDate) {
  const now = Date.now();
  const s = new Date(startDate).getTime();
  const e = new Date(endDate).getTime();
  if (!isNaN(s) && now < s) return "not_started";
  if (!isNaN(e) && now > e) return "finished";
  return "ongoing";
}

const CONTEST_STATUS_TEXT = {
  not_started: "未开始",
  ongoing: "进行中",
  finished: "已结束"
};

/** 编译状态文案（contest_team_code.compile_status） */
const COMPILE_STATUS_TEXT = {
  Waiting: "等待编译",
  Compiling: "编译中",
  Completed: "编译成功",
  Failed: "编译失败",
  "No Need": "无需编译"
};

/** 房间状态文案（contest_room.status） */
const ROOM_STATUS_TEXT = {
  Waiting: "等待中",
  Running: "对战中",
  Finished: "已结束"
};

/** 荣誉申请状态文案 */
const HONOR_STATUS_TEXT = {
  reviewing: "审核中",
  approved: "已通过",
  rejected: "未通过"
};

/** 导师申请状态文案 */
const MENTOR_STATUS_TEXT = {
  reviewing: "审核中",
  approved: "已通过",
  rejected: "未通过"
};

function truncate(str, n) {
  if (!str) return "";
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

module.exports = {
  formatDateTime,
  formatDate,
  fromNow,
  contestStatus,
  CONTEST_STATUS_TEXT,
  COMPILE_STATUS_TEXT,
  ROOM_STATUS_TEXT,
  HONOR_STATUS_TEXT,
  MENTOR_STATUS_TEXT,
  truncate
};
