const { validationResult } = require('express-validator');
const asyncHandler = (handler) => (req, res, next) =>
  Promise.resolve()
    .then(() => handler(req, res, next))
    .catch(next);
const httpError = (status, message) => Object.assign(new Error(message), { status });
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req)
    .array()
    .map((error) => error.msg);
  if (errors.length)
    return next(Object.assign(httpError(400, 'Check the form and try again.'), { errors }));
  next();
};
const positiveId = (value) => {
  if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) < 1)
    throw httpError(400, 'Choose a valid item.');
  return Number(value);
};
module.exports = { asyncHandler, httpError, handleValidationErrors, positiveId };
