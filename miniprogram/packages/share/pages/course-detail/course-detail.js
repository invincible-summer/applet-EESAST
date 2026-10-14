const portalService = require("../../../../services/portal");
const { request } = require("../../../../utils/request");
const auth = require("../../../../utils/auth");
const fmt = require("../../../../utils/format");

const DIMS = [
  { key: "dim1", label: "任务量" },
  { key: "dim2", label: "内容难度" },
  { key: "dim3", label: "上课质量" },
  { key: "dim4", label: "收获感" },
  { key: "dim5", label: "给分好坏" },
  { key: "dim6", label: "考试作业相关度" }
];

Page({
  data: {
    loading: true,
    uuid: "",
    course: null,
    avgDims: [],
    ratingCount: 0,
    myRating: null, // {dim1..6}
    dims: [],
    tab: "comments", // rating / comments
    comments: [],
    commentCount: 0,
    commentInput: "",
    editingComment: null,
    replyTo: null
  },

  onLoad(query) {
    this.setData({ uuid: query.uuid, dims: DIMS.map((d) => ({ ...d, value: 0 })) });
    const user = auth.getUser();
    this.userUuid = user.uuid;
    this.isLoggedIn = user.isLoggedIn;
    this.loadAll();
  },

  loadAll() {
    portalService
      .getCourse()
      .then((data) => {
        const c = ((data && data.course) || []).find((x) => x.uuid === this.data.uuid);
        this.setData({ course: c || null });
        return Promise.all([
          portalService.getCourseRating(this.data.uuid),
          this.isLoggedIn
            ? portalService.getCourseRatingOne(this.data.uuid, this.userUuid)
            : Promise.resolve(null),
          this.loadComments()
        ]);
      })
      .then(([ratingRes, mineRes]) => {
        const agg = (ratingRes && ratingRes.course_rating_aggregate) || {};
        const avg = (agg.aggregate && agg.aggregate.avg) || {};
        const count = (agg.aggregate && agg.aggregate.count) || 0;
        const mine = mineRes && mineRes.course_rating_by_pk;
        const dims = this.data.dims.map((d, i) => ({
          ...d,
          value: mine ? mine[d.key] : 0,
          avg: avg[d.key] ? Number(avg[d.key].toFixed(2)) : null
        }));
        this.setData({
          loading: false,
          ratingCount: count,
          dims,
          myRating: mine
            ? DIMS.reduce((o, d) => ({ ...o, [d.key]: mine[d.key] }), {})
            : null
        });
      })
      .catch(() => this.setData({ loading: false }));
  },

  loadComments() {
    return request({
      url: `/course/comments/${this.data.uuid}`,
      silent: true
    }).then((res) => {
      const list = (res && res.course_comments) || [];
      // 与 web DiscussDrawer 一致：展示已精选的评论，外加「自己发的」未精选评论
      const rows = list
        .filter((c) => !c.deleted && (c.display || c.user_uuid === this.userUuid))
        .map((c) => ({
          uuid: c.uuid,
          parentUuid: c.parent_uuid || "",
          userUuid: c.user_uuid,
          username: c.username || "匿名用户",
          comment: c.comment,
          stars: c.stars,
          likes: c.likes,
          stared: c.stared,
          liked: c.liked,
          pending: !c.display,
          time: fmt.fromNow(c.created_at),
          mine: c.user_uuid === this.userUuid,
          children: []
        }));
      // 组装父子关系：任意层级的回复都挂到顶层评论下，避免楼中楼被渲染成平铺
      const byUuid = {};
      rows.forEach((r) => (byUuid[r.uuid] = r));
      const rootOf = (row) => {
        let cur = row;
        const guard = {};
        while (cur.parentUuid && byUuid[cur.parentUuid] && !guard[cur.uuid]) {
          guard[cur.uuid] = true;
          cur = byUuid[cur.parentUuid];
        }
        return cur;
      };
      const comments = [];
      rows.forEach((row) => {
        const root = row.parentUuid ? rootOf(row) : row;
        if (root === row) comments.push(row);
        else root.children.push(row);
      });
      this.setData({ comments, commentCount: rows.length });
    });
  },

  /** 顶层评论与其回复里查找（评论列表已做嵌套，不能只查顶层） */
  findComment(uuid) {
    const top = this.data.comments;
    for (let i = 0; i < top.length; i++) {
      if (top[i].uuid === uuid) return top[i];
      const child = (top[i].children || []).find((c) => c.uuid === uuid);
      if (child) return child;
    }
    return null;
  },

  setTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  /* ---------- 评分 ---------- */
  onRateChange(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const value = Number(e.detail.value);
    this.setData({ [`dims[${idx}].value`]: value });
  },

  saveRating() {
    if (!this.requireLogin()) return;
    const d = this.data.dims;
    if (d.some((x) => !x.value)) {
      wx.showToast({ title: "请完成全部 6 项评分", icon: "none" });
      return;
    }
    const payload = {
      course_id: this.data.uuid,
      user_uuid: this.userUuid,
      dim1: d[0].value,
      dim2: d[1].value,
      dim3: d[2].value,
      dim4: d[3].value,
      dim5: d[4].value,
      dim6: d[5].value
    };
    request({
      url: this.data.myRating ? "/share/update_course_rating" : "/share/add_course_rating",
      method: "POST",
      data: payload,
      silent: true
    })
      .then(() => {
        wx.showToast({ title: "评分已保存", icon: "success" });
        this.loadAll();
      })
      .catch(() => wx.showToast({ title: "评分失败", icon: "none" }));
  },

  deleteRating() {
    wx.showModal({
      title: "删除评分",
      content: "确定删除我的评分吗？",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: "/share/delete_course_rating",
          method: "POST",
          data: { course_id: this.data.uuid, user_uuid: this.userUuid },
          silent: true
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            this.loadAll();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  /* ---------- 评论 ---------- */
  onCommentInput(e) {
    this.setData({ commentInput: e.detail.value });
  },

  /** 点「回复」：把该评论设为父级，输入区切换到回复态 */
  onReply(e) {
    if (!this.requireLogin()) return;
    const { uuid, name } = e.currentTarget.dataset;
    this.setData({ replyTo: { uuid, username: name }, editingComment: null });
  },

  requireLogin() {
    if (!this.isLoggedIn) {
      wx.showToast({ title: "请先登录", icon: "none" });
      return false;
    }
    return true;
  },

  submitComment() {
    if (!this.requireLogin()) return;
    const text = (this.data.commentInput || "").trim();
    if (!text) {
      wx.showToast({ title: "评论内容不能为空", icon: "none" });
      return;
    }
    if (this.data.editingComment) {
      request({
        url: "/course/comments/update",
        method: "POST",
        data: { comment: text, comment_uuid: this.data.editingComment },
        silent: true
      })
        .then(() => {
          wx.showToast({ title: "已更新", icon: "success" });
          this.setData({ commentInput: "", editingComment: null });
          this.loadComments();
        })
        .catch(() => wx.showToast({ title: "更新失败", icon: "none" }));
      return;
    }
    request({
      url: "/course/comments/add",
      method: "POST",
      data: {
        comment: text,
        course_uuid: this.data.uuid,
        parent_uuid: this.data.replyTo ? this.data.replyTo.uuid : null
      },
      silent: true
    })
      .then(() => {
        wx.showToast({ title: "评论已发布", icon: "success" });
        this.setData({ commentInput: "", replyTo: null });
        this.loadComments();
      })
      .catch((e) => wx.showToast({ title: e.message || "发布失败", icon: "none" }));
  },

  toggleLike(e) {
    if (!this.requireLogin()) return;
    const uuid = e.currentTarget.dataset.uuid;
    const c = this.findComment(uuid);
    if (!c) return;
    const liked = !c.liked;
    request({
      url: "/course/comments/likes/toggle",
      method: "POST",
      data: { comment_uuid: uuid, liked },
      silent: true
    })
      .then(() => this.loadComments())
      .catch(() => {});
  },

  toggleStar(e) {
    if (!this.requireLogin()) return;
    const uuid = e.currentTarget.dataset.uuid;
    const c = this.findComment(uuid);
    if (!c) return;
    const stared = !c.stared;
    request({
      url: "/course/comments/stars/toggle",
      method: "POST",
      data: { comment_uuid: uuid, stared },
      silent: true
    })
      .then(() => this.loadComments())
      .catch(() => {});
  },

  editComment(e) {
    const uuid = e.currentTarget.dataset.uuid;
    const c = this.findComment(uuid);
    if (!c || !c.mine) return; // 仅允许编辑自己的评论
    this.setData({ editingComment: uuid, commentInput: c.comment });
  },

  deleteComment(e) {
    const uuid = e.currentTarget.dataset.uuid;
    const c = this.findComment(uuid);
    if (!c || !c.mine) return; // 仅允许删除自己的评论
    wx.showModal({
      title: "删除评论",
      content: "确定删除这条评论吗？",
      confirmColor: "#ef4444",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: "/course/comments/delete",
          method: "POST",
          data: { comment_uuid: uuid },
          silent: true
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "none" });
            this.loadComments();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "none" }));
      }
    });
  },

  cancelEdit() {
    this.setData({ editingComment: null, commentInput: "", replyTo: null });
  }
});
