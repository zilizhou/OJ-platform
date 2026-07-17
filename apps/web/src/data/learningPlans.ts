export interface PlanChapter {
  key: string;
  title: string;
  description: string;
  /** 单标签筛选 */
  tags?: string;
  /** 多标签分别拉取后合并去重 */
  tagsList?: string[];
  difficulty?: number;
  pageSize: number;
  page?: number;
}

/** 算法理论知识点（用于「算法学习」等理论导向计划） */
export interface KnowledgeTopic {
  key: string;
  title: string;
  summary: string;
  keyPoints: string[];
  whenToUse?: string;
  complexity?: string;
  /** 关联下方练习章节的 key */
  practiceChapterKey?: string;
}

export interface LearningPlanConfig {
  slug: string;
  title: string;
  subtitle: string;
  gradient: string;
  accentColor: string;
  intro: string;
  goals: string[];
  /** 理论基础章节（可选） */
  topics?: KnowledgeTopic[];
  chapters: PlanChapter[];
  tips: string[];
}

export const LEARNING_PLANS: LearningPlanConfig[] = [
  {
    slug: 'intro-100',
    title: 'OJ 入门 100',
    subtitle: '从 A+B 到经典模拟，稳扎稳打 100 道',
    gradient: 'linear-gradient(135deg,#722ed1 0%,#9254de 55%,#b37feb 100%)',
    accentColor: '#722ed1',
    intro:
      '面向零基础同学，依托题库中《一本通编程启蒙》系列题目，按「输入输出 → 分支循环 → 数组字符串 → 综合模拟」四阶段循序渐进。每章 25 题，完成全部章节即可建立扎实的 OJ 基本功。',
    goals: [
      '熟悉在线评测的提交与反馈流程',
      '掌握变量、分支、循环等基础语法',
      '能独立完成简单模拟与数组操作题',
      '建立每日刷题习惯，为算法进阶打基础',
    ],
    chapters: [
      {
        key: 'io',
        title: '第 1 章 · 输入输出与变量',
        description: '认识 OJ 环境，练习基本的读入写出与简单运算。',
        tags: '一本通编程启蒙',
        difficulty: 1,
        page: 1,
        pageSize: 25,
      },
      {
        key: 'branch',
        title: '第 2 章 · 分支与循环',
        description: '用 if/else 和 for/while 处理条件判断与重复计算。',
        tags: '一本通编程启蒙',
        difficulty: 1,
        page: 2,
        pageSize: 25,
      },
      {
        key: 'array',
        title: '第 3 章 · 数组与字符串',
        description: '一维数组、字符处理，为后续算法题做准备。',
        tags: '一本通编程启蒙',
        difficulty: 1,
        page: 3,
        pageSize: 25,
      },
      {
        key: 'simulate',
        title: '第 4 章 · 综合模拟',
        description: '将所学串联，完成排序、查找、流程模拟等综合题。',
        tags: '一本通编程启蒙',
        difficulty: 1,
        page: 4,
        pageSize: 25,
      },
    ],
    tips: [
      '先阅读题面样例，手算一遍再写代码',
      '注意数据范围，选择合适的变量类型',
      'WA 时优先检查边界：n=0、n=1、最大值',
      '建议每天完成 3–5 题，保持连续提交',
    ],
  },
  {
    slug: 'algo-150',
    title: '算法精选 150',
    subtitle: '覆盖排序/搜索/DP/图论，掌握所有套路',
    gradient: 'linear-gradient(135deg,#08979c 0%,#13c2c2 50%,#36cfc9 100%)',
    accentColor: '#08979c',
    intro:
      '系统梳理竞赛常见算法专题。每个专题精选题库中对应标签的经典题目，按难度递进排列。适合已完成入门、希望建立完整算法知识图谱的同学。',
    goals: [
      '掌握排序、二分、贪心等基础算法思想',
      '理解 DFS/BFS 搜索模型的建图与遍历',
      '入门动态规划的状态设计与转移',
      '了解图论、并查集等进阶专题的基本套路',
    ],
    chapters: [
      {
        key: 'sort',
        title: '排序与二分',
        description: '排序算法应用与二分答案/二分查找模板。',
        tagsList: ['排序', '二分'],
        pageSize: 20,
      },
      {
        key: 'greedy',
        title: '贪心',
        description: '局部最优策略，区间调度、活动选择等经典模型。',
        tags: '贪心',
        pageSize: 20,
      },
      {
        key: 'recurse',
        title: '递归与分治',
        description: '递归出口、分治合并，培养问题分解能力。',
        tagsList: ['递归', '分治'],
        pageSize: 20,
      },
      {
        key: 'search',
        title: '深度与广度搜索',
        description: 'DFS/BFS 框架，连通性、层序遍历、最短路前置。',
        tagsList: ['DFS', 'BFS'],
        pageSize: 25,
      },
      {
        key: 'dp',
        title: '动态规划入门',
        description: '一维/二维 DP，背包、LIS 等经典入门模型。',
        tags: 'DP',
        pageSize: 30,
      },
      {
        key: 'graph',
        title: '图论与数据结构',
        description: '图论基础、并查集、栈队列、拓扑等专题。',
        tagsList: ['图论', '并查集', '栈', '队列', '拓扑排序', '最短路径'],
        pageSize: 25,
      },
      {
        key: 'popularize',
        title: '普及组精选',
        description: 'NOIP 普及组难度综合题，检验专题掌握程度。',
        tags: '普及+',
        pageSize: 20,
      },
    ],
    tips: [
      '每学完一个专题，用自己的话总结「识别信号」',
      '先想暴力解法，再思考如何优化到正解复杂度',
      '搜索题先画递归树或搜索图，DP 题先写状态定义',
      'AC 后阅读讨论区题解，对比不同实现思路',
    ],
  },
  {
    slug: 'algo-theory',
    title: '算法学习',
    subtitle: '分治、贪心、动态规划等核心思想，先懂理论再刷题',
    gradient: 'linear-gradient(135deg,#237804 0%,#52c41a 50%,#73d13d 100%)',
    accentColor: '#237804',
    intro:
      '算法竞赛不只是刷题，更重要的是理解思想。本路径系统讲解分治法、贪心法、动态规划、回溯搜索等经典范式，每节配有核心概念、适用场景与题库练习，帮助你建立完整的算法理论框架。',
    goals: [
      '理解各算法范式的核心思想与适用边界',
      '能根据题面特征选择合适的算法策略',
      '掌握分治、贪心、DP、搜索的基本模板',
      '通过配套练习将理论转化为解题能力',
    ],
    topics: [
      {
        key: 'complexity',
        title: '复杂度分析',
        summary: '评估算法效率的基础工具。通过大 O 表示法描述时间/空间随输入规模的增长趋势，是选择算法方案的第一步。',
        keyPoints: ['O(1) / O(log n) / O(n) / O(n log n) / O(n²)', '关注最坏情况与均摊复杂度', '空间复杂度包含辅助数组与递归栈'],
        whenToUse: '写代码前先估算暴力解法是否可行（n 与时限对照）',
        complexity: '分析对象：循环层数、递归深度、数据结构操作',
      },
      {
        key: 'divide',
        title: '分治法',
        summary: '将原问题分解为若干个规模更小、结构相同的子问题，递归求解后合并结果。归并排序、快速幂是分治的经典代表。',
        keyPoints: ['分解（Divide）→ 解决（Conquer）→ 合并（Combine）', '子问题相互独立', '递归树深度通常为 O(log n)'],
        whenToUse: '问题可拆成相同结构的子问题，且合并代价可控',
        complexity: '常见 O(n log n)，取决于分解与合并代价',
        practiceChapterKey: 'divide',
      },
      {
        key: 'greedy',
        title: '贪心法',
        summary: '每步都做当前看起来最优的选择，期望局部最优能导向全局最优。活动安排、区间覆盖是典型应用。',
        keyPoints: ['贪心选择性质：局部最优 → 全局最优', '需证明贪心策略的正确性', '常配合排序预处理'],
        whenToUse: '能证明「当前最优选择不会影响后续最优解」',
        complexity: '通常 O(n log n)（排序）或 O(n)',
        practiceChapterKey: 'greedy',
      },
      {
        key: 'dp',
        title: '动态规划',
        summary: '将复杂问题拆成重叠子问题，用表格记录子问题最优解避免重复计算。核心是最优子结构与状态转移方程。',
        keyPoints: ['最优子结构 + 重叠子问题', '状态定义 → 转移方程 → 边界初始化', '一维/二维/区间/背包等经典模型'],
        whenToUse: '方案有最优子结构，且暴力递归存在大量重复计算',
        complexity: '取决于状态数，常见 O(n) ~ O(n²)',
        practiceChapterKey: 'dp',
      },
      {
        key: 'search',
        title: '回溯与搜索',
        summary: '在解空间中系统性枚举，DFS 深入探索、BFS 层序扩展。排列组合、迷宫、连通性判定都依赖搜索框架。',
        keyPoints: ['DFS：递归 + 撤销选择（回溯）', 'BFS：队列层序遍历，适合最短路层数', '剪枝：可行性判断与上下界优化'],
        whenToUse: '解空间可枚举，或图/网格需要遍历与路径记录',
        complexity: '指数级，剪枝与记忆化是关键',
        practiceChapterKey: 'search',
      },
    ],
    chapters: [
      {
        key: 'divide',
        title: '分治法 · 配套练习',
        description: '递归、分治经典题，巩固「分解-合并」思维。',
        tagsList: ['分治', '递归'],
        pageSize: 15,
      },
      {
        key: 'greedy',
        title: '贪心法 · 配套练习',
        description: '区间调度、最优选择类题目。',
        tags: '贪心',
        pageSize: 15,
      },
      {
        key: 'dp',
        title: '动态规划 · 配套练习',
        description: '线性 DP、区间 DP、背包模型入门。',
        tagsList: ['DP', '区间DP'],
        pageSize: 25,
      },
      {
        key: 'search',
        title: '回溯与搜索 · 配套练习',
        description: 'DFS/BFS 框架题，训练搜索与剪枝。',
        tagsList: ['DFS', 'BFS'],
        pageSize: 20,
      },
    ],
    tips: [
      '先读理论再看题：每节「适用场景」是选题的关键信号',
      '一种题可尝试多种范式，对比为何某种更优',
      '分治重点在合并，贪心重点在证明，DP 重点在状态定义',
      '搜索题先画搜索树，标出剪枝条件再写代码',
    ],
  },
];

export const PLAN_MAP = Object.fromEntries(
  LEARNING_PLANS.map((p) => [p.slug, p]),
) as Record<string, LearningPlanConfig>;
