/**
 * 信息化/用户/课程/LLM GraphQL（与 web/src/graphql 对齐）
 */
const { gql } = require("../utils/graphql");

const Q = {
  getProfile: `query GetProfile($uuid: uuid!) {
    users_by_pk(uuid: $uuid) {
      username
      realname
      email
      phone
      student_no
      department
      class
      created_at
      updated_at
      tsinghua_email
      github_id
    }
  }`,

  getDepartments: `query GetDepartments {
    department { name }
  }`,

  getClasses: `query GetClasses_Name {
    classes { name department }
  }`,

  getNotices: `query GetNotices($notice_type: [String!]) {
    info_notice(
      where: { notice_type: { _in: $notice_type } }
      order_by: { updated_at: desc }
    ) {
      id
      title
      content
      created_at
      updated_at
      files
      notice_type
    }
  }`,

  getHonorApplications: `query GetHonorApplications($uuid: uuid!, $year: Int!) {
    honor_application(
      where: { student_uuid: { _eq: $uuid }, year: { _eq: $year } }
      order_by: { created_at: asc }
    ) {
      id
      honor
      statement
      attachment_url
      application_form_url
      transcript_url
      status
      created_at
      updated_at
    }
  }`,

  getApprovedMentorApplications: `query GetApprovedMentorApplications($uuid: uuid!, $year: Int!) {
    mentor_application(
      where: {
        _and: [
          {
            _or: [
              { student_uuid: { _eq: $uuid } }
              { mentor_uuid: { _eq: $uuid } }
            ]
          }
          { status: { _eq: "approved" } }
          { year: { _eq: $year } }
        ]
      }
      order_by: { created_at: asc }
    ) {
      id
      student { uuid realname }
      mentor { uuid realname }
      statement
      status
      created_at
      updated_at
    }
  }`,

  getMentorMessages: `query GetMentorMessages($from_uuid: uuid!, $to_uuid: uuid!) {
    mentor_message(
      order_by: { created_at: asc }
      where: {
        _or: [
          { _and: { from_uuid: { _eq: $from_uuid }, to_uuid: { _eq: $to_uuid } } }
          { _and: { from_uuid: { _eq: $to_uuid }, to_uuid: { _eq: $from_uuid } } }
        ]
      }
    ) {
      created_at
      from_uuid
      id
      payload
      to_uuid
    }
  }`,

  getCourse: `query GetCourse {
    course(order_by: { year: desc }) {
      code
      fullname
      language
      name
      professor
      semester
      type
      uuid
      year
    }
  }`,

  getCourseRating: `query GetCourseRating($course_uuid: uuid!) {
    course_rating_aggregate(where: { course_id: { _eq: $course_uuid } }) {
      aggregate {
        avg {
          dim1
          dim2
          dim3
          dim4
          dim5
          dim6
        }
        count(columns: user_uuid)
      }
    }
  }`,

  getCourseRatingOne: `query GetCourseRatingOne($course_uuid: uuid!, $user_uuid: uuid!) {
    course_rating_by_pk(course_id: $course_uuid, user_uuid: $user_uuid) {
      dim1
      dim2
      dim3
      dim4
      dim5
      dim6
    }
  }`,

  getWeekly: `query GetWeekly {
    weekly(order_by: [{ date: desc_nulls_last }, { id: desc }]) {
      id
      title
      url
      date
    }
  }`,

  getLLMList: `query GetLLMList {
    llm_list {
      name
      value
      deepthinkingmodel
    }
  }`
};

module.exports = {
  getProfile: (uuid) => gql(Q.getProfile, { uuid }, { silent: true }),
  getDepartments: () => gql(Q.getDepartments),
  getClasses: () => gql(Q.getClasses),
  getNotices: (notice_type) => gql(Q.getNotices, { notice_type }),
  getHonorApplications: (uuid, year) => gql(Q.getHonorApplications, { uuid, year }),
  getApprovedMentorApplications: (uuid, year) =>
    gql(Q.getApprovedMentorApplications, { uuid, year }),
  getMentorMessages: (from_uuid, to_uuid) =>
    gql(Q.getMentorMessages, { from_uuid, to_uuid }, { silent: true }),
  getCourse: () => gql(Q.getCourse, {}, { silent: true }),
  getCourseRating: (course_uuid) => gql(Q.getCourseRating, { course_uuid }),
  getCourseRatingOne: (course_uuid, user_uuid) =>
    gql(Q.getCourseRatingOne, { course_uuid, user_uuid }, { silent: true }),
  getWeekly: () => gql(Q.getWeekly),
  getLLMList: () => gql(Q.getLLMList, {}, { silent: true })
};
