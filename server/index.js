#!/usr/bin/env node

const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
const { StdioServerTransport } = require("@modelcontextprotocol/sdk/server/stdio.js");
const { z } = require("zod");
const http = require("http");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const BASE_URL = "https://api.lindo.ai";
const WEBAPP_URL = "https://app.lindo.ai";
const CONFIG_DIR = path.join(require("os").homedir(), ".lindoai");
const CONFIG_FILE = path.join(CONFIG_DIR, "mcp-config.json");

// Get API key: env var > config file > browser login
async function getApiKey() {
  // 1. Check env var
  if (process.env.LINDO_API_KEY) {
    return process.env.LINDO_API_KEY;
  }

  // 2. Check config file
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
      if (config.api_key) return config.api_key;
    }
  } catch {}

  // 3. Browser login
  console.error("No API key found. Starting browser login...");
  const apiKey = await browserLogin();
  if (apiKey) {
    // Save to config
    if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ api_key: apiKey }, null, 2));
    console.error("API key saved to " + CONFIG_FILE);
    return apiKey;
  }

  console.error("Authentication failed. Set LINDO_API_KEY env var or run again to retry.");
  process.exit(1);
}

function browserLogin() {
  return new Promise((resolve) => {
    const state = crypto.randomBytes(32).toString("hex");
    const srv = http.createServer((req, res) => {
      const url = new URL(req.url, `http://127.0.0.1`);
      if (url.pathname === "/callback") {
        const key = url.searchParams.get("key");
        const returnedState = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Authentication failed</h2><p>You can close this tab.</p></body></html>");
          srv.close();
          resolve(null);
          return;
        }

        if (returnedState !== state) {
          res.writeHead(200, { "Content-Type": "text/html" });
          res.end("<html><body><h2>Invalid state</h2><p>Please try again.</p></body></html>");
          srv.close();
          resolve(null);
          return;
        }

        res.writeHead(200, { "Content-Type": "text/html" });
        res.end("<html><body><h2>✅ Authenticated!</h2><p>You can close this tab and return to your editor.</p></body></html>");
        srv.close();
        resolve(key);
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    srv.listen(0, "127.0.0.1", () => {
      const port = srv.address().port;
      const callbackUrl = `http://127.0.0.1:${port}/callback`;
      const authUrl = `${WEBAPP_URL}/cli/authorize?state=${state}&callback_url=${encodeURIComponent(callbackUrl)}&client_name=${encodeURIComponent("Lindo MCP")}`;

      console.error(`\nOpen this URL to authenticate:\n\n  ${authUrl}\n`);

      // Try to open browser
      try {
        const platform = process.platform;
        if (platform === "darwin") execSync(`open "${authUrl}"`);
        else if (platform === "win32") execSync(`start "" "${authUrl}"`);
        else execSync(`xdg-open "${authUrl}"`);
      } catch {
        console.error("Could not open browser automatically. Please open the URL above.");
      }

      // Timeout after 120 seconds
      setTimeout(() => {
        console.error("Login timed out.");
        srv.close();
        resolve(null);
      }, 120000);
    });
  });
}

let API_KEY;

async function apiCall(path, method, body) {
  const url = `${BASE_URL}${path}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${API_KEY}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return res.json();
}

const server = new McpServer({
  name: "Lindo AI",
  version: "1.0.0",
});

// ==================== Workspace Tools ====================

server.registerTool(
  "get_workspace",
  {
    title: "Get Workspace Details",
    description: "Get workspace details.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/workspace", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_workspace",
  {
    title: "Update Workspace",
    description: "Update workspace details.",
    inputSchema: {
    business_name: z.string().optional().describe("Business name"),
    default_currency: z.string().optional().describe("Default currency"),
    language: z.string().optional().describe("Language"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ business_name, default_currency, language }) => {
    const body = {};
    if (business_name) body.business_name = business_name;
    if (default_currency) body.default_currency = default_currency;
    if (language) body.language = language;
    const data = await apiCall("/v1/workspace", "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_workspace_analytics",
  {
    title: "Get Workspace Analytics",
    description: "Get workspace analytics.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/workspace/analytics", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_workspace_team",
  {
    title: "Get Workspace Team",
    description: "Get workspace team members.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/workspace/team", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "add_workspace_team_member",
  {
    title: "Add Team Member",
    description: "Add a team member to the workspace.",
    inputSchema: {
    email: z.string().describe("Team member email"),
    role: z.string().describe("Team member role"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ email, role }) => {
    const data = await apiCall("/v1/workspace/team", "POST", { email, role });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "remove_workspace_team_member",
  {
    title: "Remove Team Member",
    description: "Remove a team member from the workspace.",
    inputSchema: {
    member_id: z.string().describe("Team member ID to remove"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ member_id }) => {
    const data = await apiCall(`/v1/workspace/team/${member_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

// ==================== Client Tools ====================

server.registerTool(
  "create_client",
  {
    title: "Create Client",
    description: "Create a new client in the workspace.",
    inputSchema: {
    name: z.string().describe("Client name"),
    email: z.string().describe("Client email"),
    phone: z.string().optional().describe("Phone number"),
    send_invitation: z.boolean().optional().describe("Send invitation email to client. Defaults to false."),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ name, email, phone, send_invitation }) => {
    const body = { name, email };
    if (phone) body.phone = phone;
    if (send_invitation !== undefined) body.send_invitation = send_invitation;
    const data = await apiCall("/v1/workspace/client/create", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "list_clients",
  {
    title: "List Clients",
    description: "List all clients in the workspace.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/workspace/client/list", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_client",
  {
    title: "Update Client",
    description: "Update an existing client.",
    inputSchema: {
    record_id: z.string().describe("Client record ID"),
    name: z.string().optional().describe("Client name"),
    email: z.string().optional().describe("Client email"),
    phone: z.string().optional().describe("Client phone number"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ record_id, name, email, phone }) => {
    const body = { record_id };
    if (name) body.name = name;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    const data = await apiCall("/v1/workspace/client/update", "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "delete_client",
  {
    title: "Delete Client",
    description: "Delete a client from the workspace.",
    inputSchema: {
    record_id: z.string().describe("Client record ID to delete"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ record_id }) => {
    const data = await apiCall("/v1/workspace/client/delete", "DELETE", { record_id });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "assign_website",
  {
    title: "Assign Website to Client",
    description: "Assign a website to a client.",
    inputSchema: {
    website_id: z.string().describe("Website ID"),
    client_id: z.string().describe("Client ID"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, client_id }) => {
    const data = await apiCall("/v1/workspace/website/assign", "POST", { website_id, client_id });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "generate_magic_link",
  {
    title: "Generate Magic Link",
    description: "Generate a magic login link for a client.",
    inputSchema: {
    client_id: z.string().describe("Client ID"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ client_id }) => {
    const data = await apiCall("/v1/workspace/client/magic-link", "POST", { client_id });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

// ==================== Website Tools ====================

server.registerTool(
  "create_website",
  {
    title: "Create Website",
    description: "Create a new website using AI. Starts an asynchronous workflow and returns a `workflow_id` immediately — poll `check_website_status` with that id to track progress and get the final result. Optionally assign to a client by providing client_id (existing) or client_email (lookup or create new).",
    inputSchema: {
    prompt: z.string().describe("Describe the website to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
    client_id: z.string().optional().describe("Existing client ID to assign the website to"),
    client_email: z.string().optional().describe("Client email. Looks up existing client or creates a new one."),
    client_name: z.string().optional().describe("Client name, used when creating a new client with client_email."),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ prompt, schedule_at, client_id, client_email, client_name }) => {
    const body = { prompt };
    if (schedule_at) body.schedule_at = schedule_at;
    if (client_id || client_email) {
      body.client = {};
      if (client_id) body.client.client_id = client_id;
      if (client_email) body.client.email = client_email;
      if (client_name) body.client.name = client_name;
    }
    const data = await apiCall("/v1/ai/workspace/website", "POST", body);
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "list_websites",
  {
    title: "List Websites",
    description: "List all websites in the workspace.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/workspace/website/list", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_website",
  {
    title: "Get Website Details",
    description: "Get website details.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_website",
  {
    title: "Update Website",
    description: "Update website details.",
    inputSchema: {
    record_id: z.string().describe("Website record ID"),
    business_name: z.string().optional().describe("Business name"),
    business_description: z.string().optional().describe("Business description"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ record_id, business_name, business_description }) => {
    const body = { record_id };
    if (business_name) body.business_name = business_name;
    if (business_description) body.business_description = business_description;
    const data = await apiCall("/v1/workspace/website/update", "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "delete_website",
  {
    title: "Delete Website",
    description: "Delete a website from the workspace.",
    inputSchema: {
    record_id: z.string().describe("Website record ID to delete"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ record_id }) => {
    const data = await apiCall("/v1/workspace/website/delete", "DELETE", { record_id });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_website_settings",
  {
    title: "Update Website Settings",
    description: "Update website settings.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    settings: z.record(z.unknown()).describe("Settings object"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, settings }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/settings`, "PUT", settings);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "add_custom_domain",
  {
    title: "Add Custom Domain",
    description: "Add a custom domain to a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    domain: z.string().describe("Custom domain to add"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, domain }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/domain`, "POST", { domain });
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "remove_custom_domain",
  {
    title: "Remove Custom Domain",
    description: "Remove a custom domain from a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/domain`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_website_team",
  {
    title: "Get Website Team",
    description: "Get website team members.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/team`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_website_analytics",
  {
    title: "Get Website Analytics",
    description: "Get website analytics.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/analytics`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

// ==================== Page Tools ====================

server.registerTool(
  "create_page",
  {
    title: "Create Page",
    description: "Create a new page on an existing website using AI. Starts an asynchronous workflow and returns a `workflow_id` immediately — poll `check_page_status` with that id to track progress and get the final result.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    prompt: z.string().describe("Describe the page to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, prompt, schedule_at }) => {
    const body = { prompt };
    if (schedule_at) body.schedule_at = schedule_at;
    const data = await apiCall(`/v1/ai/workspace/website/${website_id}/page`, "POST", body);
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "list_pages",
  {
    title: "List Pages",
    description: "List all pages on a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/list`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_page",
  {
    title: "Get Page Details",
    description: "Get page details.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_page",
  {
    title: "Update Page",
    description: "Update page metadata.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
    name: z.string().optional().describe("Page name"),
    path: z.string().optional().describe("URL path"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, page_id, name, path, seo }) => {
    const body = {};
    if (name) body.name = name;
    if (path) body.path = path;
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "delete_page",
  {
    title: "Delete Page",
    description: "Delete a page from a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID to delete"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "publish_page",
  {
    title: "Publish Page",
    description: "Publish a static page with HTML content.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    path: z.string().describe("URL path (e.g. /about)"),
    page_content: z.string().describe("Page content in HTML"),
    page_title: z.string().describe("Page title for SEO"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, path, page_content, page_title }) => {
    const body = {
      path,
      page_content,
      seo: { page_title },
    };
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/create`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_page_content",
  {
    title: "Update Page Content",
    description: "Update the content of an existing page.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
    page_content: z.string().describe("Updated page content in HTML"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, page_id, page_content, seo }) => {
    const body = { page_content };
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/update`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "unpublish_page",
  {
    title: "Unpublish Page",
    description: "Unpublish a page from a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID to unpublish"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/unpublish`, "POST");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_page_html",
  {
    title: "Get Page HTML",
    description: "Get the HTML content of a page.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/html`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

// ==================== Blog Tools ====================

server.registerTool(
  "create_blog",
  {
    title: "Create Blog Post",
    description: "Create an AI-generated blog post on a website. Starts an asynchronous workflow and returns a `workflow_id` immediately — poll `check_blog_status` with that id to track progress and get the final result.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    prompt: z.string().describe("Describe the blog post to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, prompt, schedule_at }) => {
    const body = { prompt };
    if (schedule_at) body.schedule_at = schedule_at;
    const data = await apiCall(`/v1/ai/workspace/website/${website_id}/blog`, "POST", body);
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "publish_blog",
  {
    title: "Publish Blog Post",
    description: "Publish a static blog post with markdown content.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    path: z.string().describe("URL path (e.g. /blog/my-post)"),
    blog_content: z.string().describe("Markdown content"),
    page_title: z.string().describe("Blog title"),
    author: z.string().optional().describe("Author name"),
    excerpt: z.string().optional().describe("Brief summary"),
    category: z.string().optional().describe("Category"),
    publish_date: z.string().optional().describe("Display date"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, path, blog_content, page_title, author, excerpt, category, publish_date }) => {
    const body = {
      path,
      blog_content,
      seo: { page_title },
      blog_settings: {
        ...(author && { author }),
        ...(excerpt && { excerpt }),
        ...(category && { category }),
        ...(publish_date && { publish_date }),
      },
    };
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/create`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "list_blogs",
  {
    title: "List Blog Posts",
    description: "List all blog posts on a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/list`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_blog",
  {
    title: "Get Blog Details",
    description: "Get blog post details.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_blog",
  {
    title: "Update Blog",
    description: "Update blog post metadata.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
    name: z.string().optional().describe("Blog name"),
    path: z.string().optional().describe("URL path"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, blog_id, name, path, seo }) => {
    const body = {};
    if (name) body.name = name;
    if (path) body.path = path;
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "delete_blog",
  {
    title: "Delete Blog Post",
    description: "Delete a blog post from a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID to delete"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "update_blog_content",
  {
    title: "Update Blog Content",
    description: "Update the content of an existing blog post.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
    blog_content: z.string().describe("Updated blog content in Markdown"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
    blog_settings: z.record(z.unknown()).optional().describe("Blog settings object"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, blog_id, blog_content, seo, blog_settings }) => {
    const body = { blog_content };
    if (seo) body.seo = seo;
    if (blog_settings) body.blog_settings = blog_settings;
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/update`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "unpublish_blog",
  {
    title: "Unpublish Blog Post",
    description: "Unpublish a blog post from a website.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID to unpublish"),
  },
    annotations: { readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/unpublish`, "POST");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

server.registerTool(
  "get_blog_html",
  {
    title: "Get Blog HTML",
    description: "Get the HTML content of a blog post.",
    inputSchema: {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/html`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data?.result ?? data, null, 2) }] };
  }
);

// ==================== Workflow Status Tools ====================
// Three dedicated status tools + three batch status tools + three batch create
// tools so agents can operate on up to 25 workflows at a time. Each status
// tool returns an envelope:
//   { success, done, status, workflow_id, message, poll_after_ms?, result?, error? }
// Poll again after `poll_after_ms` ms while `done` is false.

server.registerTool(
  "check_website_status",
  {
    title: "Check Website Creation Status",
    description: "Poll the status of a website-creation workflow started by `create_website`. Pass the `workflow_id` you received from that tool. While the workflow is running, call this again after `poll_after_ms` ms. Once `done` is true, `status` is `complete` (all pages generated), `partial` (some failed), or `errored`. `result.pages` lists every page (home + additional) with its individual status.",
    inputSchema: {
    workflow_id: z.string().describe("Workflow id returned by create_website"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_id }) => {
    const data = await apiCall(`/v1/ai/workspace/website/status/${encodeURIComponent(workflow_id)}`, "GET");
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "check_page_status",
  {
    title: "Check Page Creation Status",
    description: "Poll the status of a page-creation workflow started by `create_page`. Pass the `workflow_id` you received from that tool. While running, call this again after `poll_after_ms` ms. Once `done` is true, `status` is `complete` or `errored`; when complete, `result` holds the published page info.",
    inputSchema: {
    workflow_id: z.string().describe("Workflow id returned by create_page"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_id }) => {
    const data = await apiCall(`/v1/ai/workspace/page/status/${encodeURIComponent(workflow_id)}`, "GET");
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "check_blog_status",
  {
    title: "Check Blog Creation Status",
    description: "Poll the status of a blog-creation workflow started by `create_blog`. Pass the `workflow_id` you received from that tool. While running, call this again after `poll_after_ms` ms. Once `done` is true, `status` is `complete` or `errored`; when complete, `result` holds the published blog info.",
    inputSchema: {
    workflow_id: z.string().describe("Workflow id returned by create_blog"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_id }) => {
    const data = await apiCall(`/v1/ai/workspace/blog/status/${encodeURIComponent(workflow_id)}`, "GET");
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

// --- Batch create (up to 25 per request) ---

const batchWebsiteItem = z.object({
  prompt: z.string().min(10),
  schedule_at: z.string().optional(),
  client: z
    .object({
      client_id: z.string().optional(),
      email: z.string().email().optional(),
      name: z.string().optional(),
    })
    .optional(),
});
const batchPageOrBlogItem = z.object({
  prompt: z.string().min(10),
  schedule_at: z.string().optional(),
});

server.registerTool(
  "batch_create_websites",
  {
    title: "Create Multiple Websites (Batch)",
    description: "Start up to 25 website-creation workflows in one request. Returns one `workflow_id` per item. Poll the combined status with `batch_check_website_status`, or the individual ones with `check_website_status`.",
    inputSchema: {
    items: z.array(batchWebsiteItem).min(1).max(25).describe("Between 1 and 25 website creation requests"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ items }) => {
    const data = await apiCall("/v1/ai/workspace/website/batch", "POST", { items });
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "batch_create_pages",
  {
    title: "Create Multiple Pages (Batch)",
    description: "Start up to 25 page-creation workflows on a single website in one request. Returns one `workflow_id` per item. Poll with `batch_check_page_status` or `check_page_status`.",
    inputSchema: {
    website_id: z.string().describe("Website the pages will be added to"),
    items: z.array(batchPageOrBlogItem).min(1).max(25).describe("Between 1 and 25 page creation requests"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, items }) => {
    const data = await apiCall(
      `/v1/ai/workspace/website/${encodeURIComponent(website_id)}/page/batch`,
      "POST",
      { items },
    );
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "batch_create_blogs",
  {
    title: "Create Multiple Blog Posts (Batch)",
    description: "Start up to 25 blog-creation workflows on a single website in one request. Returns one `workflow_id` per item. Poll with `batch_check_blog_status` or `check_blog_status`.",
    inputSchema: {
    website_id: z.string().describe("Website the blog posts will be added to"),
    items: z.array(batchPageOrBlogItem).min(1).max(25).describe("Between 1 and 25 blog post creation requests"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  },
  async ({ website_id, items }) => {
    const data = await apiCall(
      `/v1/ai/workspace/website/${encodeURIComponent(website_id)}/blog/batch`,
      "POST",
      { items },
    );
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

// --- Batch status (up to 25 per request) ---

server.registerTool(
  "batch_check_website_status",
  {
    title: "Check Multiple Website Workflow Statuses",
    description: "Poll up to 25 website-creation workflows at once. Returns a rollup `status` (scheduled/running/complete/partial/errored) plus a per-item array with the same shape as `check_website_status`.",
    inputSchema: {
    workflow_ids: z.array(z.string()).min(1).max(25).describe("Up to 25 website workflow_ids to check"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_ids }) => {
    const data = await apiCall("/v1/ai/workspace/website/status/batch", "POST", { workflow_ids });
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "batch_check_page_status",
  {
    title: "Check Multiple Page Workflow Statuses",
    description: "Poll up to 25 page-creation workflows at once. Returns a rollup `status` plus a per-item array with the same shape as `check_page_status`.",
    inputSchema: {
    workflow_ids: z.array(z.string()).min(1).max(25).describe("Up to 25 page workflow_ids to check"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_ids }) => {
    const data = await apiCall("/v1/ai/workspace/page/status/batch", "POST", { workflow_ids });
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "batch_check_blog_status",
  {
    title: "Check Multiple Blog Workflow Statuses",
    description: "Poll up to 25 blog-creation workflows at once. Returns a rollup `status` plus a per-item array with the same shape as `check_blog_status`.",
    inputSchema: {
    workflow_ids: z.array(z.string()).min(1).max(25).describe("Up to 25 blog workflow_ids to check"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ workflow_ids }) => {
    const data = await apiCall("/v1/ai/workspace/blog/status/batch", "POST", { workflow_ids });
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

// ==================== Credits Tools ====================

server.registerTool(
  "get_credits",
  {
    title: "Get Workspace Credits",
    description: "Get workspace credit balance.",
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async () => {
    const data = await apiCall("/v1/ai/credits", "GET");
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "get_client_credits",
  {
    title: "Get Client Credits",
    description: "Get client credit balance.",
    inputSchema: {
    client_id: z.string().describe("The client ID"),
  },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  async ({ client_id }) => {
    const data = await apiCall(`/v1/ai/credits/client?client_id=${client_id}`, "GET");
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

server.registerTool(
  "allocate_credits",
  {
    title: "Allocate Credits",
    description: "Allocate credits to a client.",
    inputSchema: {
    client_id: z.string().describe("Client ID"),
    credit_type: z.enum(["monthly", "purchased", "daily"]).describe("Credit type"),
    amount: z.number().describe("Number of credits"),
    source: z.string().optional().describe("Source (e.g. bonus)"),
    notes: z.string().optional().describe("Notes"),
  },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  },
  async ({ client_id, credit_type, amount, source, notes }) => {
    const body = { client_id, credit_type, amount };
    if (source) body.source = source;
    if (notes) body.notes = notes;
    const data = await apiCall("/v1/ai/credits/client/allocate", "POST", body);
    const payload = data?.result || data;
    return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
  }
);

// Start the server
async function main() {
  API_KEY = await getApiKey();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
