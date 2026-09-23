const portalService = require("../../../../services/portal");
const auth = require("../../../../utils/auth");

Page({
  data: {
    loading: true,
    access: "ok",
    courses: [],
    filtered: [],
    keyword: "",
    typeFilter: "",
    types: []
  },

  onLoad() {
    // course 表仅对 student/teacher/counselor 开放（Hasura 行级权限）
    if (!auth.hasRole(["student", "teacher", "counselor"])) {
      this.setData({ access: "forbidden", loading: false });
      return;
    }
    portalService
      .getCourse()
      .then((data) => {
        const courses = ((data && data.course) || []).map((c) => ({
          uuid: c.uuid,
          name: c.name,
          fullname: c.fullname || c.name,
          code: c.code,
          professor: c.professor,
          semester: c.semester,
          year: c.year,
          type: c.type,
          language: c.language
        }));
        const types = [];
        courses.forEach((c) => {
          if (c.type && types.indexOf(c.type) < 0) types.push(c.type);
        });
        this.setData({ courses, filtered: courses, types, loading: false });
      })
      .catch(() => this.setData({ loading: false }));
  },

  onSearch(e) {
    this.setData({ keyword: e.detail.value }, () => this.applyFilter());
  },

  setType(e) {
    const t = e.currentTarget.dataset.type;
    this.setData({ typeFilter: this.data.typeFilter === t ? "" : t }, () => this.applyFilter());
  },

  applyFilter() {
    const kw = (this.data.keyword || "").trim().toLowerCase();
    let list = this.data.courses;
    if (this.data.typeFilter) list = list.filter((c) => c.type === this.data.typeFilter);
    if (kw) {
      list = list.filter(
        (c) =>
          c.name.toLowerCase().indexOf(kw) >= 0 ||
          c.fullname.toLowerCase().indexOf(kw) >= 0 ||
          (c.professor || "").indexOf(kw) >= 0 ||
          (c.code || "").toLowerCase().indexOf(kw) >= 0
      );
    }
    this.setData({ filtered: list });
  },

  goLogin() {
    wx.switchTab({ url: "/pages/user/user" });
  },

  goDetail(e) {
    wx.navigateTo({
      url: `/packages/share/pages/course-detail/course-detail?uuid=${e.currentTarget.dataset.uuid}`
    });
  }
});
