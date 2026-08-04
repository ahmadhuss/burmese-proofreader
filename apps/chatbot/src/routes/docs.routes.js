const express = require("express");
const { apiReference } = require("@scalar/express-api-reference");

const router = express.Router();

router.use(
  "/",
  apiReference({
    layout: "modern",
    theme: "default",
    darkMode: false,
    telemetry: false,
    showDeveloperTools: "never",
    showSidebar: true,
    defaultOpenFirstTag: true,
    defaultOpenAllTags: true,
    expandAllModelSections: false,
    expandAllResponses: true,
    hideClientButton: true,
    hideDarkModeToggle: false,
    hideModels: false,
    hideSearch: false,
    showOperationId: true,
    hideTestRequestButton: false,
    hideDownloadButton: true,
    customCss: `
      .powered-by,
      .powered-by-scalar,
      [class*="powered-by"],
      [class*="PoweredBy"],
      a[href*="scalar.com"][target="_blank"] {
        display: none !important;
      }
    `,
    mcp: { disabled: true },
    agent: { disabled: true, hideAddApi: true },
    spec: { url: "/openapi.json" },
    metaData: {
      title: "Chatbot API Documentation",
      description: "Interactive API documentation and playground for the RAG Messenger chatbot API."
    }
  })
);

module.exports = router;
