const localFrontendOrigins = [
  "http://localhost:5173",
  "http://127.0.0.1:5173"
];

export const getCorsOrigins = () =>
  process.env.CORS_ORIGIN?.split(",").map((origin) => origin.trim()).filter(Boolean) ?? localFrontendOrigins;
