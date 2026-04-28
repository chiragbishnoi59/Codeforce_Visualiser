import React, { useState } from 'react';
import {
  fetchProblemsetWithCache,
  fetchUserInfo,
  fetchUserRating,
  fetchUserStatus
} from './utils/codeforces';
import {
  buildSolvedProblemSet,
  buildTopicSignals,
  getTargetRating,
  getWeakTopics,
  selectDailyProblems
} from './utils/recommendationEngine';
import { getAiInsights } from './services/ai';

const calculateStats = (problems) => {
  const difficultyCount = { easy: 0, medium: 0, hard: 0 };
  const topicCount = {};
  const ratingCount = {};

  problems.forEach((problem) => {
    if (problem.rating) {
      if (problem.rating <= 1200) {
        difficultyCount.easy += 1;
      } else if (problem.rating <= 1800) {
        difficultyCount.medium += 1;
      } else {
        difficultyCount.hard += 1;
      }

      const ratingRange = Math.floor(problem.rating / 100) * 100;
      ratingCount[ratingRange] = (ratingCount[ratingRange] || 0) + 1;
    }

    (problem.tags || []).forEach((tag) => {
      topicCount[tag] = (topicCount[tag] || 0) + 1;
    });
  });

  return {
    totalProblems: problems.length,
    difficultyCount,
    topicCount,
    ratingCount
  };
};

const formatDate = (timestamp) =>
  new Date(timestamp * 1000).toLocaleDateString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric'
  });

const formatDateTime = (timestamp) =>
  new Date(timestamp * 1000).toLocaleString('en-US', {
    month: 'short',
    day: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });

const formatTag = (tag) =>
  tag
    .replace(/([A-Z])/g, ' $1')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const fallbackFocus = (weakTopics) => {
  if (!weakTopics.length) {
    return 'Keep solving mixed 1200-1500 tasks and increase speed on implementation details.';
  }

  const topicNames = weakTopics.slice(0, 2).map((item) => formatTag(item.topic));
  return `Prioritize ${topicNames.join(' and ')} this week with 2 focused sessions.`;
};

const difficultyClass = (rating) => {
  if (!rating) {
    return 'pill-slate';
  }

  if (rating <= 1200) {
    return 'pill-emerald';
  }

  if (rating <= 1800) {
    return 'pill-amber';
  }

  return 'pill-rose';
};

const RatingGraph = ({ ratingHistory }) => {
  const [hoveredIndex, setHoveredIndex] = useState(null);

  if (ratingHistory.length === 0) {
    return (
      <div className="text-center text-slate-500 py-10">
        No rating history available.
      </div>
    );
  }

  const width = 760;
  const height = 320;
  const padding = 44;
  const minRating = Math.min(...ratingHistory.map((item) => item.newRating)) - 80;
  const maxRating = Math.max(...ratingHistory.map((item) => item.newRating)) + 80;

  const xScale = (index) =>
    ratingHistory.length === 1
      ? width / 2
      : padding + (index * (width - padding * 2)) / (ratingHistory.length - 1);

  const yScale = (rating) =>
    height - padding - ((rating - minRating) * (height - padding * 2)) / (maxRating - minRating);

  const pathData = ratingHistory
    .map((contest, index) => {
      const x = xScale(index);
      const y = yScale(contest.newRating);
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  return (
    <div className="overflow-x-auto">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label="Codeforces rating history line chart"
        className="min-w-full"
      >
        {[...Array(5)].map((_, index) => {
          const y = padding + (index * (height - padding * 2)) / 4;
          const rating = Math.round(maxRating - (index * (maxRating - minRating)) / 4);

          return (
            <g key={rating}>
              <line
                x1={padding}
                y1={y}
                x2={width - padding}
                y2={y}
                stroke="#dbe7f3"
                strokeWidth="1"
              />
              <text x={padding - 8} y={y + 4} fontSize="11" fill="#4b5563" textAnchor="end">
                {rating}
              </text>
            </g>
          );
        })}

        <path d={pathData} stroke="#0f766e" strokeWidth="3" fill="none" />

        {ratingHistory.map((contest, index) => {
          const x = xScale(index);
          const y = yScale(contest.newRating);
          const ratingChange = contest.newRating - contest.oldRating;
          const isPositive = ratingChange >= 0;
          const isHovered = hoveredIndex === index;

          return (
            <g key={`${contest.contestId}-${index}`}>
              <circle
                cx={x}
                cy={y}
                r="14"
                fill="transparent"
                tabIndex={0}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              />
              <circle
                cx={x}
                cy={y}
                r={isHovered ? '6' : '4'}
                fill={isPositive ? '#16a34a' : '#e11d48'}
                stroke="white"
                strokeWidth="2"
              />
              {isHovered && (
                <text
                  x={x}
                  y={y - 14}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="700"
                  fill={isPositive ? '#16a34a' : '#e11d48'}
                >
                  {isPositive ? '+' : ''}
                  {ratingChange}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
};

const App = () => {
  const [username, setUsername] = useState('');
  const [userData, setUserData] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [recentSubmissions, setRecentSubmissions] = useState([]);
  const [recentContests, setRecentContests] = useState([]);
  const [ratingHistory, setRatingHistory] = useState([]);
  const [weakTopics, setWeakTopics] = useState([]);
  const [dailyProblems, setDailyProblems] = useState([]);
  const [targetRating, setTargetRating] = useState(null);
  const [weeklyFocus, setWeeklyFocus] = useState('');
  const [problemReasonMap, setProblemReasonMap] = useState({});
  const [aiEnabled, setAiEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [error, setError] = useState('');
  const [aiError, setAiError] = useState('');

  const applyAiInsights = async ({ weakTopicList, picks, ratingGoal }) => {
    if (!aiEnabled) {
      return;
    }

    setAiLoading(true);
    setAiError('');

    try {
      const ai = await getAiInsights({
        weakTopics: weakTopicList,
        dailyProblems: picks,
        targetRating: ratingGoal
      });

      if (!ai) {
        setAiError('AI key missing. Add REACT_APP_GROQ_API_KEY (or REACT_APP_GEMINI_API_KEY) to enable assistant insights.');
        return;
      }

      if (ai.weeklyFocus) {
        setWeeklyFocus(ai.weeklyFocus);
      }

      if (Array.isArray(ai.weakTopics) && ai.weakTopics.length > 0) {
        const tipLookup = ai.weakTopics.reduce((acc, item) => {
          if (item.topic && item.tip) {
            acc[item.topic.toLowerCase()] = item.tip;
          }
          return acc;
        }, {});

        setWeakTopics((current) =>
          current.map((topic) => ({
            ...topic,
            tip: tipLookup[topic.topic.toLowerCase()] || topic.tip
          }))
        );
      }

      if (Array.isArray(ai.problemReasons)) {
        const reasonMap = ai.problemReasons.reduce((acc, item) => {
          if (item.key && item.reason) {
            acc[item.key] = item.reason;
          }
          return acc;
        }, {});
        setProblemReasonMap(reasonMap);
      }
    } catch (err) {
      setAiError(err.message || 'AI insights failed. Showing rule-based recommendations.');
    } finally {
      setAiLoading(false);
    }
  };

  const fetchUserData = async (handle) => {
    setLoading(true);
    setRecommendationLoading(true);
    setError('');
    setAiError('');
    setProblemReasonMap({});

    try {
      const [userInfo, userStatus, userRating] = await Promise.all([
        fetchUserInfo(handle),
        fetchUserStatus(handle),
        fetchUserRating(handle).catch(() => [])
      ]);

      const profile = userInfo[0];
      setUserData(profile);

      const acceptedSubmissions = userStatus
        .filter((submission) => submission.verdict === 'OK')
        .sort((a, b) => b.creationTimeSeconds - a.creationTimeSeconds);

      const uniqueProblems = new Map();
      acceptedSubmissions.forEach((submission) => {
        const key = `${submission.problem.contestId}-${submission.problem.index}`;
        if (!uniqueProblems.has(key)) {
          uniqueProblems.set(key, {
            ...submission.problem,
            submissionTime: submission.creationTimeSeconds
          });
        }
      });

      const solvedProblems = Array.from(uniqueProblems.values());
      const stats = calculateStats(solvedProblems);
      setUserStats(stats);
      setRecentSubmissions(solvedProblems.slice(0, 10));

      const contests = (userRating || [])
        .slice(-10)
        .reverse()
        .map((contest) => ({
          ...contest,
          ratingChange: contest.newRating - contest.oldRating
        }));
      setRatingHistory(userRating || []);
      setRecentContests(contests);

      const topicSignals = buildTopicSignals(solvedProblems);
      const weakTopicList = getWeakTopics(topicSignals, 6).map((topic) => ({
        ...topic,
        tip: 'Practice 2-3 problems from this tag this week.'
      }));

      const solvedSet = buildSolvedProblemSet(solvedProblems);
      const ratingGoal = getTargetRating(solvedProblems, profile.rating || 1100);
      const allProblems = await fetchProblemsetWithCache();
      const picks = selectDailyProblems({
        allProblems,
        solvedSet,
        weakTopics: weakTopicList,
        targetRating: ratingGoal,
        count: 5
      });

      setWeakTopics(weakTopicList);
      setDailyProblems(picks);
      setTargetRating(ratingGoal);
      setWeeklyFocus(fallbackFocus(weakTopicList));

      await applyAiInsights({ weakTopicList, picks, ratingGoal });
    } catch (err) {
      setError(err.message || 'Unexpected error while fetching data.');
      setUserData(null);
      setUserStats(null);
      setRecentSubmissions([]);
      setRecentContests([]);
      setRatingHistory([]);
      setWeakTopics([]);
      setDailyProblems([]);
      setWeeklyFocus('');
    } finally {
      setLoading(false);
      setRecommendationLoading(false);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const handle = username.trim();
    if (!handle) {
      return;
    }
    fetchUserData(handle);
  };

  return (
    <div className="app-shell min-h-screen text-slate-900">
      <div className="ambient-orb ambient-orb--left" />
      <div className="ambient-orb ambient-orb--right" />

      <header className="relative border-b border-white/40 bg-white/75 backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
          <p className="eyebrow mb-3">Codeforces Intelligence Lab</p>
          <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
            Train Smarter With Daily Problem Guidance
          </h1>
          <p className="mt-3 max-w-2xl text-slate-700">
            Get five personalized daily problems, weak-topic signals, and optional AI coaching built on your contest history.
          </p>

          <form onSubmit={handleSubmit} className="mt-8 rounded-2xl border border-white/60 bg-white/80 p-4 shadow-card">
            <label htmlFor="handle" className="sr-only">
              Codeforces username
            </label>
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                id="handle"
                type="text"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                placeholder="Enter Codeforces username"
                className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 outline-none transition focus-visible:border-cf-teal focus-visible:ring-2 focus-visible:ring-cf-teal/30 disabled:bg-slate-100"
                disabled={loading}
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="rounded-xl bg-cf-navy px-6 py-3 font-semibold text-white transition hover:bg-cf-ink disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Analyzing profile...' : 'Analyze'}
              </button>
            </div>

            <div className="mt-4 flex items-center gap-3">
              <input
                id="ai-toggle"
                type="checkbox"
                checked={aiEnabled}
                onChange={(event) => setAiEnabled(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-cf-teal focus:ring-cf-teal"
              />
              <label htmlFor="ai-toggle" className="text-sm text-slate-700">
                Enable AI coaching notes
              </label>
            </div>
          </form>
        </div>
      </header>

      <main className="relative mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
        {error && (
          <div role="alert" className="mb-6 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-rose-700">
            {error}
          </div>
        )}

        {aiError && (
          <div role="alert" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-amber-700">
            {aiError}
          </div>
        )}

        {userData && userStats && (
          <div className="space-y-8 animate-fade-in">
            <section className="dashboard-card">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="eyebrow">Overview</p>
                  <h2 className="font-display text-3xl font-semibold">{userData.handle}</h2>
                  <p className="mt-1 text-slate-600">Current rank: {userData.rank || 'Unrated'}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="pill-slate">Rating: {userData.rating || 'N/A'}</span>
                  <span className="pill-slate">Max Rating: {userData.maxRating || 'N/A'}</span>
                  <span className="pill-cyan">Target Practice Rating: {targetRating || 'N/A'}</span>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-3">
              <article className="dashboard-card lg:col-span-1">
                <p className="eyebrow">Solved Mix</p>
                <h3 className="mt-2 text-3xl font-semibold text-cf-navy">{userStats.totalProblems}</h3>
                <p className="text-sm text-slate-600">Unique accepted problems</p>

                <div className="mt-5 space-y-4">
                  {[
                    {
                      label: 'Easy (<=1200)',
                      value: userStats.difficultyCount.easy,
                      color: 'bg-emerald-500'
                    },
                    {
                      label: 'Medium (1201-1800)',
                      value: userStats.difficultyCount.medium,
                      color: 'bg-amber-500'
                    },
                    {
                      label: 'Hard (>1800)',
                      value: userStats.difficultyCount.hard,
                      color: 'bg-rose-500'
                    }
                  ].map((item) => (
                    <div key={item.label}>
                      <div className="mb-1 flex items-center justify-between text-sm">
                        <span className="text-slate-700">{item.label}</span>
                        <span className="font-semibold text-slate-900">{item.value}</span>
                      </div>
                      <div className="h-2 rounded-full bg-slate-200">
                        <div
                          className={`h-2 rounded-full ${item.color}`}
                          style={{
                            width: `${
                              userStats.totalProblems === 0
                                ? 0
                                : (item.value / userStats.totalProblems) * 100
                            }%`
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card lg:col-span-1">
                <p className="eyebrow">Topics to Practice More</p>
                <h3 className="mt-2 text-xl font-semibold">Weak Topic Signals</h3>
                <div className="mt-4 space-y-3">
                  {weakTopics.length === 0 && (
                    <p className="text-sm text-slate-500">No weak topics found yet.</p>
                  )}
                  {weakTopics.map((topic) => (
                    <div key={topic.topic} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-medium text-slate-900">{formatTag(topic.topic)}</p>
                        <span className="pill-amber">Solved: {topic.solvedCount}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600">{topic.reason}</p>
                      <p className="mt-1 text-sm text-cf-navy">{topic.tip}</p>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card lg:col-span-1">
                <p className="eyebrow">Weekly Focus</p>
                <h3 className="mt-2 text-xl font-semibold">Coaching Summary</h3>
                <p className="mt-4 rounded-xl border border-cyan-100 bg-cyan-50 p-4 text-slate-700">
                  {aiLoading ? 'Generating AI coaching notes...' : weeklyFocus}
                </p>
                <div className="mt-5">
                  <p className="mb-3 text-sm font-medium text-slate-700">Top Topics</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(userStats.topicCount)
                      .sort((a, b) => b[1] - a[1])
                      .slice(0, 8)
                      .map(([topic, count]) => (
                        <span key={topic} className="pill-cyan">
                          {formatTag(topic)} ({count})
                        </span>
                      ))}
                  </div>
                </div>
              </article>
            </section>

            <section className="dashboard-card">
              <div className="mb-4 flex flex-col gap-1 md:flex-row md:items-end md:justify-between">
                <div>
                  <p className="eyebrow">Daily Plan</p>
                  <h3 className="font-display text-2xl font-semibold">5 Problems For Today</h3>
                </div>
                {recommendationLoading && <p className="text-sm text-slate-500">Refreshing recommendations...</p>}
              </div>

              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
                {dailyProblems.map((problem) => {
                  const key = `${problem.contestId}-${problem.index}`;
                  return (
                    <article key={key} className="group rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-1 hover:shadow-hover">
                      <a
                        href={`https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="line-clamp-2 font-medium text-cf-navy underline-offset-2 hover:underline"
                      >
                        {problem.contestId}
                        {problem.index} - {problem.name}
                      </a>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <span className={difficultyClass(problem.rating)}>{problem.rating || 'Unrated'}</span>
                        {problem.weakTags.slice(0, 1).map((tag) => (
                          <span key={tag} className="pill-cyan">
                            {formatTag(tag)}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-sm text-slate-600">
                        {problemReasonMap[key] || problem.reason}
                      </p>
                    </article>
                  );
                })}
              </div>
            </section>

            {ratingHistory.length > 0 && (
              <section className="dashboard-card">
                <p className="eyebrow">Trajectory</p>
                <h3 className="font-display text-2xl font-semibold">Rating Progress</h3>
                <div className="mt-5 rounded-xl border border-slate-200 bg-white p-3 sm:p-5">
                  <RatingGraph ratingHistory={ratingHistory} />
                </div>
              </section>
            )}

            <section className="grid gap-6 xl:grid-cols-2">
              <article className="dashboard-card">
                <p className="eyebrow">Contests</p>
                <h3 className="font-display text-xl font-semibold">Recent Contests</h3>
                <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {recentContests.length === 0 && (
                    <p className="p-4 text-sm text-slate-500">No contest rating history found.</p>
                  )}
                  {recentContests.map((contest) => (
                    <div key={contest.contestId} className="p-4">
                      <a
                        href={`https://codeforces.com/contest/${contest.contestId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-cf-navy underline-offset-2 hover:underline"
                      >
                        {contest.contestName}
                      </a>
                      <div className="mt-2 flex flex-wrap gap-3 text-sm text-slate-600">
                        <span>Rank: {contest.rank}</span>
                        <span>{contest.oldRating} to {contest.newRating}</span>
                        <span className={contest.ratingChange >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                          {contest.ratingChange >= 0 ? '+' : '-'}{Math.abs(contest.ratingChange)}
                        </span>
                        <span>{formatDateTime(contest.ratingUpdateTimeSeconds)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="dashboard-card">
                <p className="eyebrow">Recent Activity</p>
                <h3 className="font-display text-xl font-semibold">Latest Solved Problems</h3>
                <div className="mt-4 divide-y divide-slate-200 rounded-xl border border-slate-200 bg-white">
                  {recentSubmissions.map((problem) => (
                    <div key={`${problem.contestId}-${problem.index}`} className="p-4">
                      <a
                        href={`https://codeforces.com/contest/${problem.contestId}/problem/${problem.index}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-cf-navy underline-offset-2 hover:underline"
                      >
                        {problem.contestId}
                        {problem.index} - {problem.name}
                      </a>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span className={difficultyClass(problem.rating)}>
                          {problem.rating || 'Unrated'}
                        </span>
                        <span>{formatDate(problem.submissionTime)}</span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {(problem.tags || []).slice(0, 4).map((tag) => (
                          <span key={tag} className="pill-cyan">
                            {formatTag(tag)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
