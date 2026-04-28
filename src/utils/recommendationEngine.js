const WEAK_TOPIC_FLOOR = 3;

const normalizeTag = (tag) => tag.trim().toLowerCase();

export const buildSolvedProblemSet = (problems) => {
  const solvedSet = new Set();

  problems.forEach((problem) => {
    if (!problem.contestId || !problem.index) {
      return;
    }

    solvedSet.add(`${problem.contestId}-${problem.index}`);
  });

  return solvedSet;
};

export const buildTopicSignals = (problems) => {
  const totalCount = {};
  const recentCount = {};
  const lastThirty = [...problems]
    .sort((a, b) => b.submissionTime - a.submissionTime)
    .slice(0, 30);

  problems.forEach((problem) => {
    (problem.tags || []).forEach((tag) => {
      const normalized = normalizeTag(tag);
      totalCount[normalized] = (totalCount[normalized] || 0) + 1;
    });
  });

  lastThirty.forEach((problem) => {
    (problem.tags || []).forEach((tag) => {
      const normalized = normalizeTag(tag);
      recentCount[normalized] = (recentCount[normalized] || 0) + 1;
    });
  });

  return { totalCount, recentCount };
};

export const getWeakTopics = (topicSignals, maxItems = 6) => {
  const topics = Object.keys(topicSignals.totalCount);

  if (topics.length === 0) {
    return [];
  }

  return topics
    .map((topic) => {
      const totalSolved = topicSignals.totalCount[topic] || 0;
      const recentSolved = topicSignals.recentCount[topic] || 0;
      const floorGap = Math.max(0, WEAK_TOPIC_FLOOR - totalSolved);
      const score = floorGap * 3 + Math.max(0, 3 - recentSolved);

      return {
        topic,
        solvedCount: totalSolved,
        recentSolved,
        score,
        reason:
          totalSolved < WEAK_TOPIC_FLOOR
            ? `Only ${totalSolved} solved so far`
            : `Low recent exposure (${recentSolved} in last 30 solves)`
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, maxItems);
};

export const getTargetRating = (solvedProblems, fallbackRating = 1100) => {
  const rated = solvedProblems
    .map((problem) => problem.rating)
    .filter((rating) => Number.isFinite(rating))
    .sort((a, b) => a - b);

  if (rated.length === 0) {
    return fallbackRating;
  }

  const middle = Math.floor(rated.length / 2);
  const median =
    rated.length % 2 === 0
      ? Math.round((rated[middle - 1] + rated[middle]) / 2)
      : rated[middle];

  return Math.max(800, median + 100);
};

const candidateScore = (problem, weakTopicSet, targetRating) => {
  const rating = problem.rating || targetRating;
  const ratingDistance = Math.abs(rating - targetRating);
  const weakOverlap = (problem.tags || []).filter((tag) =>
    weakTopicSet.has(normalizeTag(tag))
  ).length;

  return weakOverlap * 6 - ratingDistance / 100;
};

export const selectDailyProblems = ({
  allProblems,
  solvedSet,
  weakTopics,
  targetRating,
  count = 5
}) => {
  const weakTopicSet = new Set(weakTopics.map((item) => normalizeTag(item.topic)));

  const candidates = allProblems
    .filter((problem) => {
      if (!problem.contestId || !problem.index || !problem.rating) {
        return false;
      }

      const key = `${problem.contestId}-${problem.index}`;
      if (solvedSet.has(key)) {
        return false;
      }

      return Math.abs(problem.rating - targetRating) <= 250;
    })
    .map((problem) => ({
      ...problem,
      score: candidateScore(problem, weakTopicSet, targetRating)
    }))
    .sort((a, b) => b.score - a.score);

  const selected = [];
  const usedPrimaryTags = new Set();

  for (const problem of candidates) {
    const primaryTag = normalizeTag((problem.tags && problem.tags[0]) || 'misc');

    if (selected.length < count - 1 && usedPrimaryTags.has(primaryTag)) {
      continue;
    }

    usedPrimaryTags.add(primaryTag);
    selected.push(problem);

    if (selected.length === count) {
      break;
    }
  }

  if (selected.length < count) {
    const fallback = candidates.filter(
      (problem) => !selected.some((picked) => picked.contestId === problem.contestId && picked.index === problem.index)
    );

    for (const problem of fallback) {
      selected.push(problem);
      if (selected.length === count) {
        break;
      }
    }
  }

  return selected.map((problem) => {
    const matchingWeakTags = (problem.tags || []).filter((tag) =>
      weakTopicSet.has(normalizeTag(tag))
    );

    return {
      ...problem,
      weakTags: matchingWeakTags,
      reason:
        matchingWeakTags.length > 0
          ? `Targets ${matchingWeakTags.slice(0, 2).join(', ')}`
          : 'Good rating-fit practice for progression'
    };
  });
};
