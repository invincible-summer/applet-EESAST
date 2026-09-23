// Markdown 渲染组件：块级原生渲染 + 行内 rich-text
const { parseMarkdown } = require("../../utils/markdown");

Component({
  options: { addGlobalClass: true },
  properties: {
    md: {
      type: String,
      value: "",
      observer() {
        this.render();
      }
    }
  },
  data: {
    blocks: []
  },
  lifetimes: {
    attached() {
      this.render();
    }
  },
  methods: {
    render() {
      const blocks = parseMarkdown(this.data.md);
      this.setData({ blocks });
    },
    onCopyCode(e) {
      const text = e.currentTarget.dataset.text;
      if (!text) return;
      wx.setClipboardData({ data: text });
    },
    onPreviewImg(e) {
      const src = e.currentTarget.dataset.src;
      if (!src) return;
      wx.previewImage({ urls: [src] });
    }
  }
});
