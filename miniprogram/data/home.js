/**
 * 首页静态数据（与 web/src/app/HomeSite 保持同源）
 */
const config = require("../config/index");

const STATIC = config.STATIC_URL;

/** 轮播新闻（web NewsPage.tsx 同款内容） */
const news = [
  {
    title: "清华大学电子工程系学生科协",
    image: `${STATIC}/public/images/eesast-group-photo-2025.jpg`
  },
  {
    title: "新生信息知识竞赛",
    image: `${STATIC}/public/images/knowledge-contest-2019.jpg`
  },
  {
    title: "硬件设计大赛",
    image: `${STATIC}/public/images/hardware-design-contest-2019.jpg`
  }
];

/** 部门（web HomeSite index.tsx 部门卡片区） */
const divisions = [
  {
    name: "软件部",
    desc: "负责各类软件项目与工具的开发维护，是科协的代码中坚力量。",
    cover: `${STATIC}/public/images/2024/software.jpg`,
    tab: 0
  },
  {
    name: "硬件部",
    desc: "聚焦电子设计与嵌入式系统，承办硬件设计大赛。",
    cover: `${STATIC}/public/images/2024/hardware.jpg`,
    tab: 1
  },
  {
    name: "项目部",
    desc: "组织管理科协自有项目孵化与推进。",
    cover: `${STATIC}/public/images/2024/project.jpg`,
    tab: 2
  },
  {
    name: "学培部",
    desc: "策划技术培训与讲座，助力同学技能成长。",
    cover: `${STATIC}/public/images/2024/training.jpg`,
    tab: 3
  },
  {
    name: "宣策部",
    desc: "负责科协品牌宣传与活动策划。",
    cover: `${STATIC}/public/images/2024/publicity.jpg`,
    tab: 4
  }
];

/** 赛事展示墙（web displayWallConfig.json 同源） */
const displayWall = [
  {
    id: 1,
    image: "https://static.eesast.com/public/images/2024/2024_THUAI_8.png",
    title: "队式程序设计大赛（THUAI）",
    description:
      "“队式程序设计大赛”是由清华大学电子系科协举办的一项经典赛事，是一个组队参加的对抗性策略程序设计比赛。比赛主题往往基于某款经典电子游戏，设计出的全新规则，邀请选手组队设计出更加完善和智能的游戏策略，并用高效的程序代码实现。",
    docs: "https://docs.eesast.com/docs/contests/thuai"
  },
  {
    id: 2,
    image: "https://static.eesast.com/public/images/2024/2024_hardware_2024_1.jpg",
    title: "硬件设计大赛",
    description:
      "硬件设计大赛是清华大学电子系主办的一个比赛，主要面向电子系零基础的同学，赛前有若干次培训讲座，现场发放相应的模块，带领大家从零开始接触、学习单片机的基本操作，旨在激发同学们对硬件的热情。",
    docs: "https://docs.eesast.com/docs/contests/hardware"
  },
  {
    id: 3,
    image: "https://static.eesast.com/public/images/2024/2024_software_2025.png",
    title: "软件设计大赛",
    description:
      "软件设计大赛在每年【寒假前后】举办。软件设计大赛要求参赛者使用当今主流的技术栈，面向某个特定需求，完成一套具备一定可用性和美观性的软件程序。对于“软件”的定义十分宽泛，游戏、网站、APP都可以作为作品提交。",
    docs: "https://docs.eesast.com/docs/contests/software"
  },
  {
    id: 5,
    image: "https://static.eesast.com/public/images/2024/2024_freshman_knowledge_2.jpg",
    title: "新生信息知识竞赛",
    description:
      "全校初赛采取统一笔试环节，选取五到七支队伍进入决赛。电子系系内初赛及全校决赛试题以PowerPoint形式，有必答题、抢答题、视频题、女生题、人气题、你说我猜题、渐进抢答题和风险题等环节，均为现场作答。",
    docs: "https://docs.eesast.com/docs/contests/freshman-knowledge-contest"
  },
  {
    id: 6,
    image: "https://static.eesast.com/public/images/2024/2024_challenge_1.jpg",
    title: "挑战杯",
    description:
      "清华大学“挑战杯”学生课外学术科技作品竞赛是由教务处、科研院、研究生院、校团委和校学生科协共同主办的全校性学生课外科技作品竞赛，在电子系承办的诸多赛事中对参赛者的综合能力要求最高。",
    docs: "https://docs.eesast.com/docs/contests/challenge-cup"
  },
  {
    id: 7,
    image: "https://static.eesast.com/public/images/2024/2024_electric_25.jpg",
    title: "电子设计大赛",
    description:
      "“电子设计大赛”是由清华大学电子系和自动化系合办的面向全校的比赛，选手可以组成不多于四人的队伍报名参加比赛。比赛一般是要求选手设计一辆智能车，根据赛题内容设计机械结构，编写单片机代码，实现自动控制。",
    docs: "https://docs.eesast.com/docs/contests/electronic-design-contest"
  }
];

module.exports = { news, divisions, displayWall };
