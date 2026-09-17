function relativeTime(dateLike) {
  if (!dateLike) return 'never';
  const diffMs = Date.now() - new Date(dateLike).getTime();
  const sec = Math.round(diffMs / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}

/** One-liner used on /start summarizing when we last actually heard from
 * either channel — whichever is more recent. */
function relativeLastSeen(botState) {
  if (!botState) return 'Last check: never';
  const lastPoll = botState.last_poll_at;
  const lastPush = botState.last_push_at;
  const mostRecent =
    lastPoll && lastPush
      ? new Date(lastPoll) > new Date(lastPush)
        ? lastPoll
        : lastPush
      : lastPoll || lastPush;
  return `Last check: ${relativeTime(mostRecent)}`;
}

module.exports = { relativeTime, relativeLastSeen };
