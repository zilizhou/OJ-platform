export interface Badge {
  key: string;
  name: string;
  description: string;
  color: string;
}

interface Stats {
  acProblemCount: number;
  totalSubmissions: number;
  languageCount: number;
  contestCount: number;
  firstAcAt?: Date | null;
}

const ALL: { test: (s: Stats) => boolean; badge: Badge }[] = [
  { test: (s) => !!s.firstAcAt, badge: { key: 'first_ac', name: '初出茅庐', description: '完成第一道 AC', color: 'green' } },
  { test: (s) => s.acProblemCount >= 10, badge: { key: 'ac_10', name: '入门玩家', description: 'AC 10 道题', color: 'cyan' } },
  { test: (s) => s.acProblemCount >= 50, badge: { key: 'ac_50', name: '进阶选手', description: 'AC 50 道题', color: 'blue' } },
  { test: (s) => s.acProblemCount >= 100, badge: { key: 'ac_100', name: '百题斩', description: 'AC 100 道题', color: 'geekblue' } },
  { test: (s) => s.acProblemCount >= 500, badge: { key: 'ac_500', name: '题海高手', description: 'AC 500 道题', color: 'purple' } },
  { test: (s) => s.languageCount >= 3, badge: { key: 'polyglot', name: '多语言玩家', description: '使用过 3 种以上语言', color: 'gold' } },
  { test: (s) => s.contestCount >= 5, badge: { key: 'contestant', name: '竞赛者', description: '参加过 5 场比赛', color: 'volcano' } },
  { test: (s) => s.totalSubmissions >= 1000, badge: { key: 'persistent', name: '勤奋之星', description: '累计提交 1000+ 次', color: 'magenta' } },
];

export function deriveBadges(s: Stats): Badge[] {
  return ALL.filter((b) => b.test(s)).map((b) => b.badge);
}
