function formatZodIssue(issue) {
  const field = issue.path.join(".");
  return field ? `${field}: ${issue.message}` : issue.message;
}

function validate(source, schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);

    if (!result.success) {
      return res.status(400).json({
        error: result.error.issues.map(formatZodIssue).join("; ")
      });
    }

    if (source !== "headers") {
      req[source] = result.data;
    }

    next();
  };
}

function validateResponse(schema, payload, label = "response") {
  const result = schema.safeParse(payload);

  if (!result.success) {
    const details = result.error.issues.map(formatZodIssue).join("; ");
    throw new Error(`Invalid ${label}: ${details}`);
  }

  return payload;
}

function sendJson(res, schema, payload, label = "response") {
  if (process.env.NODE_ENV !== "production") {
    try {
      validateResponse(schema, payload, label);
    } catch (err) {
      console.warn(`[response-validation] ${err.message}`);
    }
  }

  return res.json(payload);
}

module.exports = { sendJson, validate, validateResponse };
