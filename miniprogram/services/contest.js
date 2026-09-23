/**
 * 赛事模块 GraphQL（与 web/src/graphql/contest/*.graphql 对齐）
 * Subscription 一律改为 Query + 页面轮询
 */
const { gql } = require("../utils/graphql");

const Q = {
  getContests: `query GetContests {
    contest(order_by: { start_date: desc }) {
      fullname
      description
      end_date
      id
      start_date
      name
    }
  }`,

  getContestInfo: `query GetContestInfo($contest_id: uuid!) {
    contest_by_pk(id: $contest_id) {
      fullname
      name
      description
      start_date
      end_date
      team_switch
      code_upload_switch
      arena_switch
      playground_switch
      stream_switch
      playback_switch
      contest_managers {
        user_uuid
      }
    }
  }`,

  getContestTimes: `query GetContestTimes($contest_id: uuid!) {
    contest_time(
      where: { contest_id: { _eq: $contest_id } }
      order_by: { time: asc }
    ) {
      id
      event
      time
    }
  }`,

  getContestNotices: `query GetContestNotices($contest_id: uuid!) {
    contest_notice(
      where: { contest_id: { _eq: $contest_id } }
      order_by: { updated_at: desc }
    ) {
      content
      created_at
      updated_at
      files
      id
      title
    }
  }`,

  getContestPlayers: `query GetContestPlayers($contest_id: uuid!) {
    contest_player(where: { contest_id: { _eq: $contest_id } }) {
      team_label
      player_label
      roles_available
    }
  }`,

  getTeam: `query GetTeam($user_uuid: uuid!, $contest_id: uuid!) {
    contest_team_member(
      where: {
        user_uuid: { _eq: $user_uuid }
        contest_team: { contest_id: { _eq: $contest_id } }
      }
    ) {
      contest_team {
        team_id
      }
    }
  }`,

  getTeamInfo: `query GetTeamInfo($team_id: uuid!) {
    contest_team_by_pk(team_id: $team_id) {
      team_name
      team_intro
      team_id
      invited_code
      team_leader {
        uuid
        realname
      }
      contest_team_members {
        user {
          realname
          student_no
          class
          uuid
        }
      }
    }
  }`,

  getTeamStat: `query getTeamStat($team_id: uuid!) {
    contest_team_by_pk(team_id: $team_id) {
      contest_team_codes_aggregate {
        aggregate { count }
      }
      contest_team_rooms_aggregate(
        where: { contest_room: { round_id: { _is_null: true } } }
      ) {
        aggregate {
          count
          sum { score }
        }
      }
    }
  }`,

  getTotalTeamNum: `query getTotalTeamNum($contest_id: uuid!) {
    contest_team_aggregate(where: { contest: { id: { _eq: $contest_id } } }) {
      aggregate { count }
    }
  }`,

  getTotalMemberNum: `query getTotalMemberNum($contest_id: uuid!) {
    contest_team_member_aggregate(
      where: { contest_team: { contest: { id: { _eq: $contest_id } } } }
    ) {
      aggregate { count }
    }
  }`,

  getTeams: `query getTeams($contest_id: uuid!) {
    contest_team(
      where: { contest_id: { _eq: $contest_id } }
      order_by: { contest_team_rooms_aggregate: { sum: { score: desc_nulls_last } } }
    ) {
      team_id
      team_name
      team_intro
      team_leader { realname }
      contest_team_members {
        user { realname student_no }
      }
      contest_team_rooms_aggregate(
        where: { contest_room: { round_id: { _is_null: true } } }
      ) {
        aggregate {
          count
          sum { score }
        }
      }
      contest_team_players_aggregate(
        where: { player_code: { compile_status: { _in: ["No Need", "Completed"] } } }
      ) {
        aggregate { count }
      }
    }
  }`,

  getTeamCodes: `query GetTeamCodes($team_id: uuid!) {
    contest_team_code(
      order_by: { created_at: desc }
      where: { team_id: { _eq: $team_id } }
    ) {
      code_id
      code_name
      language
      compile_status
      created_at
    }
  }`,

  getTeamPlayers: `query GetTeamPlayers($team_id: uuid!) {
    contest_team_player(where: { team_id: { _eq: $team_id } }) {
      player
      player_code {
        code_id
        code_name
        language
        created_at
      }
      role
    }
  }`,

  getArenaRooms: `query GetArenaRooms($contest_id: uuid!) {
    contest_room(
      where: {
        _and: { contest_id: { _eq: $contest_id }, round_id: { _is_null: true } }
      }
      order_by: { created_at: desc }
    ) {
      room_id
      status
      port
      created_at
      contest_room_teams {
        contest_team {
          team_id
          team_name
          team_leader { realname }
        }
        score
        team_label
        player_roles
      }
    }
  }`,

  getRLScores: `query GetRLScores($contest_id: uuid!) {
    contest_team_RL_score(
      where: { contest_team: { contest_id: { _eq: $contest_id } } }
      order_by: { score: desc_nulls_last }
    ) {
      team_id
      score
      contest_team {
        team_name
        team_leader { realname }
        contest_team_members {
          user { realname student_no }
        }
      }
    }
  }`
};

const M = {
  addTeam: `mutation AddTeam(
    $team_name: String!
    $team_intro: String = ""
    $team_leader_uuid: uuid!
    $invited_code: String!
    $contest_id: uuid!
  ) {
    insert_contest_team_one(
      object: {
        team_name: $team_name
        team_intro: $team_intro
        team_leader_uuid: $team_leader_uuid
        invited_code: $invited_code
        contest_id: $contest_id
        contest_team_members: { data: { user_uuid: $team_leader_uuid } }
      }
    ) {
      team_id
    }
  }`,

  deleteTeam: `mutation DeleteTeam($team_id: uuid!) {
    delete_contest_team_by_pk(team_id: $team_id) {
      team_id
    }
  }`,

  deleteTeamMember: `mutation DeleteTeamMember($user_uuid: uuid!, $team_id: uuid!) {
    delete_contest_team_member_by_pk(user_uuid: $user_uuid, team_id: $team_id) {
      team_id
    }
  }`,

  updateTeam: `mutation UpdateTeam(
    $team_id: uuid!
    $team_name: String!
    $team_intro: String!
  ) {
    update_contest_team_by_pk(
      pk_columns: { team_id: $team_id }
      _set: { team_name: $team_name, team_intro: $team_intro }
    ) {
      team_id
    }
  }`,

  addTeamCode: `mutation AddTeamCode(
    $team_id: uuid!
    $code_name: String!
    $language: String!
    $compile_status: String
  ) {
    insert_contest_team_code_one(
      object: {
        team_id: $team_id
        code_name: $code_name
        language: $language
        compile_status: $compile_status
      }
    ) {
      code_id
    }
  }`,

  deleteTeamCode: `mutation DeleteTeamCode($code_id: uuid!) {
    delete_contest_team_code_by_pk(code_id: $code_id) {
      code_id
    }
  }`,

  updateTeamCodeName: `mutation UpdateTeamCodeName($code_id: uuid!, $code_name: String!) {
    update_contest_team_code_by_pk(
      pk_columns: { code_id: $code_id }
      _set: { code_name: $code_name }
    ) {
      code_id
    }
  }`,

  updateTeamPlayer: `mutation UpdateTeamPlayer(
    $team_id: uuid!
    $player: String!
    $code_id: uuid
    $role: String
  ) {
    update_contest_team_player_by_pk(
      pk_columns: { team_id: $team_id, player: $player }
      _set: { code_id: $code_id, role: $role }
    ) {
      player
    }
  }`
};

module.exports = {
  getContests: () => gql(Q.getContests),
  getContestInfo: (contest_id) => gql(Q.getContestInfo, { contest_id }),
  getContestTimes: (contest_id) => gql(Q.getContestTimes, { contest_id }),
  getContestNotices: (contest_id) => gql(Q.getContestNotices, { contest_id }),
  getContestPlayers: (contest_id) => gql(Q.getContestPlayers, { contest_id }),
  getTeam: (user_uuid, contest_id) => gql(Q.getTeam, { user_uuid, contest_id }),
  getTeamInfo: (team_id) => gql(Q.getTeamInfo, { team_id }),
  getTeamStat: (team_id) => gql(Q.getTeamStat, { team_id }),
  getTotalTeamNum: (contest_id) => gql(Q.getTotalTeamNum, { contest_id }),
  getTotalMemberNum: (contest_id) => gql(Q.getTotalMemberNum, { contest_id }),
  getTeams: (contest_id) => gql(Q.getTeams, { contest_id }),
  getTeamCodes: (team_id) => gql(Q.getTeamCodes, { team_id }, { silent: true }),
  getTeamPlayers: (team_id) => gql(Q.getTeamPlayers, { team_id }),
  getArenaRooms: (contest_id) => gql(Q.getArenaRooms, { contest_id }, { silent: true }),
  getRLScores: (contest_id) => gql(Q.getRLScores, { contest_id }),
  addTeam: (v) => gql(M.addTeam, v),
  deleteTeam: (team_id) => gql(M.deleteTeam, { team_id }),
  deleteTeamMember: (user_uuid, team_id) => gql(M.deleteTeamMember, { user_uuid, team_id }),
  updateTeam: (v) => gql(M.updateTeam, v),
  addTeamCode: (v) => gql(M.addTeamCode, v),
  deleteTeamCode: (code_id) => gql(M.deleteTeamCode, { code_id }),
  updateTeamCodeName: (code_id, code_name) => gql(M.updateTeamCodeName, { code_id, code_name }),
  updateTeamPlayer: (v) => gql(M.updateTeamPlayer, v)
};
