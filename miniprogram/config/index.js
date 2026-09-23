/**
 * 全局配置
 * 与 web 端 .env 保持一致（https://api.eesast.com 为生产环境）
 */
const config = {
  /** REST API 基地址 */
  API_BASE: "https://api.eesast.com",
  /** Hasura GraphQL 端点 */
  GRAPHQL_URL: "https://api.eesast.com/v1/graphql",
  /** 静态资源 CDN */
  STATIC_URL: "https://static.eesast.com",
  /** 腾讯云 COS */
  COS: {
    bucket: "eesast-1255334966",
    region: "ap-beijing"
  },
  /** 网站首页（复制链接等场景引导用户前往网页端） */
  WEB_URL: "https://eesast.com",
  /** 角色组定义（与 web/src/app/Components/Authenticate.tsx 对齐） */
  ROLES: {
    userRoles: ["user", "student", "teacher", "counselor"],
    tsinghuaRoles: ["student", "teacher", "counselor"],
    courseRoles: ["student", "teacher", "counselor"]
  },
  ROLE_NAMES: {
    user: "用户",
    student: "学生",
    teacher: "教师",
    counselor: "辅导员",
    admin: "管理员",
    anonymous: "游客"
  }
};

module.exports = config;
