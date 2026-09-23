/**
 * GraphQL 请求封装（Hasura /v1/graphql）
 * query 字符串集中在 services/ 目录，与 web/src/graphql/*.graphql 对齐
 */
const config = require("../config/index");
const { request } = require("./request");

/**
 * @param {string} query    GraphQL query/mutation 字符串
 * @param {object} [variables]
 * @param {boolean} [silent] 失败不弹 toast（默认弹）
 * @returns {Promise<object>} data 部分
 */
function gql(query, variables, opts) {
  const options = opts || {};
  return request({
    url: config.GRAPHQL_URL,
    method: "POST",
    data: { query, variables: variables || {} },
    silent: options.silent,
    withAuth: options.withAuth !== false
  }).then((res) => {
    if (res && res.errors && res.errors.length) {
      const first = res.errors[0];
      const e = {
        statusCode: first.extensions ? first.extensions.code : "GRAPHQL_ERROR",
        message: first.message || "GraphQL 请求失败"
      };
      if (!options.silent) wx.showToast({ title: e.message.slice(0, 30), icon: "none" });
      throw e;
    }
    return res ? res.data : null;
  });
}

module.exports = { gql };
