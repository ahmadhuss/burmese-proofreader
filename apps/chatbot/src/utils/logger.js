const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL] ?? LOG_LEVELS.info;

function fmt(level, msg, meta) {
  const ts = new Date().toISOString();
  const base = `[${ts}] [${level.toUpperCase()}] ${msg}`;
  return meta ? `${base} ${JSON.stringify(meta)}` : base;
}

const logger = {
  debug: (msg, meta) => CURRENT_LEVEL <= LOG_LEVELS.debug && console.debug(fmt("debug", msg, meta)),
  info: (msg, meta) => CURRENT_LEVEL <= LOG_LEVELS.info && console.log(fmt("info", msg, meta)),
  warn: (msg, meta) => CURRENT_LEVEL <= LOG_LEVELS.warn && console.warn(fmt("warn", msg, meta)),
  error: (msg, meta) => CURRENT_LEVEL <= LOG_LEVELS.error && console.error(fmt("error", msg, meta))
};

module.exports = logger;
