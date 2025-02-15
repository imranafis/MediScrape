import React from "react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createHashRouter, RouterProvider } from "react-router-dom";
import LoginPage from "./Login/LoginPage.jsx";
import LandingPage from "./LandingPage.jsx";
import HistoryPage from "./HistoryPage.jsx";
import AnalysisPage from "./AnalysisPage.jsx";

const router = createHashRouter([
  {
    path: "/",
    element: <LoginPage />,
  },
  {
    path: "/Landing",
    element: <LandingPage />,
  },
  {
    path: "/history",
    element: <HistoryPage />,
  },
  {
    path: "/analysis",
    element: <AnalysisPage />,
  },
]);

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
