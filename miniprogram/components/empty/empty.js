// 空状态组件
Component({
  options: { addGlobalClass: true },
  properties: {
    text: { type: String, value: "暂无数据" },
    loading: { type: Boolean, value: false },
    loadingText: { type: String, value: "加载中…" }
  }
});
