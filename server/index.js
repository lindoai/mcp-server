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

server.tool(
  "get_workspace",
  "Get workspace details.",
  {},
  { title: "Get Workspace Details", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/workspace", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_workspace",
  "Update workspace details.",
  {
    business_name: z.string().optional().describe("Business name"),
    default_currency: z.string().optional().describe("Default currency"),
    language: z.string().optional().describe("Language"),
  },
  { title: "Update Workspace", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ business_name, default_currency, language }) => {
    const body = {};
    if (business_name) body.business_name = business_name;
    if (default_currency) body.default_currency = default_currency;
    if (language) body.language = language;
    const data = await apiCall("/v1/workspace", "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_workspace_analytics",
  "Get workspace analytics.",
  {},
  { title: "Get Workspace Analytics", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/workspace/analytics", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_workspace_team",
  "Get workspace team members.",
  {},
  { title: "Get Workspace Team", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/workspace/team", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_workspace_team_member",
  "Add a team member to the workspace.",
  {
    email: z.string().describe("Team member email"),
    role: z.string().describe("Team member role"),
  },
  { title: "Add Team Member", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ email, role }) => {
    const data = await apiCall("/v1/workspace/team", "POST", { email, role });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_workspace_team_member",
  "Remove a team member from the workspace.",
  {
    member_id: z.string().describe("Team member ID to remove"),
  },
  { title: "Remove Team Member", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ member_id }) => {
    const data = await apiCall(`/v1/workspace/team/${member_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ==================== Client Tools ====================

server.tool(
  "create_client",
  "Create a new client in the workspace.",
  {
    name: z.string().describe("Client name"),
    email: z.string().describe("Client email"),
    phone: z.string().optional().describe("Phone number"),
    send_invitation: z.boolean().optional().describe("Send invitation email to client. Defaults to false."),
  },
  { title: "Create Client", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ name, email, phone, send_invitation }) => {
    const body = { name, email };
    if (phone) body.phone = phone;
    if (send_invitation !== undefined) body.send_invitation = send_invitation;
    const data = await apiCall("/v1/workspace/client/create", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_clients",
  "List all clients in the workspace.",
  {},
  { title: "List Clients", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/workspace/client/list", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_client",
  "Update an existing client.",
  {
    record_id: z.string().describe("Client record ID"),
    name: z.string().optional().describe("Client name"),
    email: z.string().optional().describe("Client email"),
    phone: z.string().optional().describe("Client phone number"),
  },
  { title: "Update Client", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ record_id, name, email, phone }) => {
    const body = { record_id };
    if (name) body.name = name;
    if (email) body.email = email;
    if (phone) body.phone = phone;
    const data = await apiCall("/v1/workspace/client/update", "PUT", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_client",
  "Delete a client from the workspace.",
  {
    record_id: z.string().describe("Client record ID to delete"),
  },
  { title: "Delete Client", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ record_id }) => {
    const data = await apiCall("/v1/workspace/client/delete", "DELETE", { record_id });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "assign_website",
  "Assign a website to a client.",
  {
    website_id: z.string().describe("Website ID"),
    client_id: z.string().describe("Client ID"),
  },
  { title: "Assign Website to Client", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ website_id, client_id }) => {
    const data = await apiCall("/v1/workspace/website/assign", "POST", { website_id, client_id });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "generate_magic_link",
  "Generate a magic login link for a client.",
  {
    client_id: z.string().describe("Client ID"),
  },
  { title: "Generate Magic Link", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ client_id }) => {
    const data = await apiCall("/v1/workspace/client/magic-link", "POST", { client_id });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ==================== Website Tools ====================

server.tool(
  "create_website",
  "Create a new website using AI. Optionally assign to a client by providing client_id (existing) or client_email (lookup or create new).",
  {
    prompt: z.string().describe("Describe the website to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
    client_id: z.string().optional().describe("Existing client ID to assign the website to"),
    client_email: z.string().optional().describe("Client email. Looks up existing client or creates a new one."),
    client_name: z.string().optional().describe("Client name, used when creating a new client with client_email."),
  },
  { title: "Create Website", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_websites",
  "List all websites in the workspace.",
  {},
  { title: "List Websites", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/workspace/website/list", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_website",
  "Get website details.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "Get Website Details", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_website",
  "Update website details.",
  {
    record_id: z.string().describe("Website record ID"),
    business_name: z.string().optional().describe("Business name"),
    business_description: z.string().optional().describe("Business description"),
  },
  { title: "Update Website", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ record_id, business_name, business_description }) => {
    const body = { record_id };
    if (business_name) body.business_name = business_name;
    if (business_description) body.business_description = business_description;
    const data = await apiCall("/v1/workspace/website/update", "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_website",
  "Delete a website from the workspace.",
  {
    record_id: z.string().describe("Website record ID to delete"),
  },
  { title: "Delete Website", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ record_id }) => {
    const data = await apiCall("/v1/workspace/website/delete", "DELETE", { record_id });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_website_settings",
  "Update website settings.",
  {
    website_id: z.string().describe("The website ID"),
    settings: z.record(z.unknown()).describe("Settings object"),
  },
  { title: "Update Website Settings", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ website_id, settings }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/settings`, "PUT", settings);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "add_custom_domain",
  "Add a custom domain to a website.",
  {
    website_id: z.string().describe("The website ID"),
    domain: z.string().describe("Custom domain to add"),
  },
  { title: "Add Custom Domain", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ website_id, domain }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/domain`, "POST", { domain });
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "remove_custom_domain",
  "Remove a custom domain from a website.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "Remove Custom Domain", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/domain`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_website_team",
  "Get website team members.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "Get Website Team", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/team`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_website_analytics",
  "Get website analytics.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "Get Website Analytics", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/analytics`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ==================== Page Tools ====================

server.tool(
  "create_page",
  "Create a new page on an existing website using AI.",
  {
    website_id: z.string().describe("The website ID"),
    prompt: z.string().describe("Describe the page to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
  },
  { title: "Create Page", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ website_id, prompt, schedule_at }) => {
    const body = { prompt };
    if (schedule_at) body.schedule_at = schedule_at;
    const data = await apiCall(`/v1/ai/workspace/website/${website_id}/page`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_pages",
  "List all pages on a website.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "List Pages", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/list`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_page",
  "Get page details.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
  },
  { title: "Get Page Details", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_page",
  "Update page metadata.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
    name: z.string().optional().describe("Page name"),
    path: z.string().optional().describe("URL path"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
  { title: "Update Page", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ website_id, page_id, name, path, seo }) => {
    const body = {};
    if (name) body.name = name;
    if (path) body.path = path;
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_page",
  "Delete a page from a website.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID to delete"),
  },
  { title: "Delete Page", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "publish_page",
  "Publish a static page with HTML content.",
  {
    website_id: z.string().describe("The website ID"),
    path: z.string().describe("URL path (e.g. /about)"),
    page_content: z.string().describe("Page content in HTML"),
    page_title: z.string().describe("Page title for SEO"),
  },
  { title: "Publish Page", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ website_id, path, page_content, page_title }) => {
    const body = {
      path,
      page_content,
      seo: { page_title },
    };
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/create`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_page_content",
  "Update the content of an existing page.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
    page_content: z.string().describe("Updated page content in HTML"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
  { title: "Update Page Content", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ website_id, page_id, page_content, seo }) => {
    const body = { page_content };
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/update`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "unpublish_page",
  "Unpublish a page from a website.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID to unpublish"),
  },
  { title: "Unpublish Page", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/unpublish`, "POST");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_page_html",
  "Get the HTML content of a page.",
  {
    website_id: z.string().describe("The website ID"),
    page_id: z.string().describe("The page ID"),
  },
  { title: "Get Page HTML", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id, page_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/pages/${page_id}/html`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ==================== Blog Tools ====================

server.tool(
  "create_blog",
  "Create an AI-generated blog post on a website.",
  {
    website_id: z.string().describe("The website ID"),
    prompt: z.string().describe("Describe the blog post to create"),
    schedule_at: z.string().optional().describe("Optional ISO 8601 datetime to schedule for later"),
  },
  { title: "Create Blog Post", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ website_id, prompt, schedule_at }) => {
    const body = { prompt };
    if (schedule_at) body.schedule_at = schedule_at;
    const data = await apiCall(`/v1/ai/workspace/website/${website_id}/blog`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "publish_blog",
  "Publish a static blog post with markdown content.",
  {
    website_id: z.string().describe("The website ID"),
    path: z.string().describe("URL path (e.g. /blog/my-post)"),
    blog_content: z.string().describe("Markdown content"),
    page_title: z.string().describe("Blog title"),
    author: z.string().optional().describe("Author name"),
    excerpt: z.string().optional().describe("Brief summary"),
    category: z.string().optional().describe("Category"),
    publish_date: z.string().optional().describe("Display date"),
  },
  { title: "Publish Blog Post", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
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
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "list_blogs",
  "List all blog posts on a website.",
  {
    website_id: z.string().describe("The website ID"),
  },
  { title: "List Blog Posts", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/list`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_blog",
  "Get blog post details.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
  },
  { title: "Get Blog Details", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_blog",
  "Update blog post metadata.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
    name: z.string().optional().describe("Blog name"),
    path: z.string().optional().describe("URL path"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
  },
  { title: "Update Blog", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ website_id, blog_id, name, path, seo }) => {
    const body = {};
    if (name) body.name = name;
    if (path) body.path = path;
    if (seo) body.seo = seo;
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "PATCH", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "delete_blog",
  "Delete a blog post from a website.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID to delete"),
  },
  { title: "Delete Blog Post", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}`, "DELETE");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "update_blog_content",
  "Update the content of an existing blog post.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
    blog_content: z.string().describe("Updated blog content in Markdown"),
    seo: z.record(z.unknown()).optional().describe("SEO settings object"),
    blog_settings: z.record(z.unknown()).optional().describe("Blog settings object"),
  },
  { title: "Update Blog Content", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  async ({ website_id, blog_id, blog_content, seo, blog_settings }) => {
    const body = { blog_content };
    if (seo) body.seo = seo;
    if (blog_settings) body.blog_settings = blog_settings;
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/update`, "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "unpublish_blog",
  "Unpublish a blog post from a website.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID to unpublish"),
  },
  { title: "Unpublish Blog Post", readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/unpublish`, "POST");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_blog_html",
  "Get the HTML content of a blog post.",
  {
    website_id: z.string().describe("The website ID"),
    blog_id: z.string().describe("The blog post ID"),
  },
  { title: "Get Blog HTML", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ website_id, blog_id }) => {
    const data = await apiCall(`/v1/workspace/website/${website_id}/blogs/${blog_id}/html`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// ==================== Credits Tools ====================

server.tool(
  "get_credits",
  "Get workspace credit balance.",
  {},
  { title: "Get Workspace Credits", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async () => {
    const data = await apiCall("/v1/ai/credits", "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "get_client_credits",
  "Get client credit balance.",
  {
    client_id: z.string().describe("The client ID"),
  },
  { title: "Get Client Credits", readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  async ({ client_id }) => {
    const data = await apiCall(`/v1/ai/credits/client?client_id=${client_id}`, "GET");
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

server.tool(
  "allocate_credits",
  "Allocate credits to a client.",
  {
    client_id: z.string().describe("Client ID"),
    credit_type: z.enum(["monthly", "purchased", "daily"]).describe("Credit type"),
    amount: z.number().describe("Number of credits"),
    source: z.string().optional().describe("Source (e.g. bonus)"),
    notes: z.string().optional().describe("Notes"),
  },
  { title: "Allocate Credits", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  async ({ client_id, credit_type, amount, source, notes }) => {
    const body = { client_id, credit_type, amount };
    if (source) body.source = source;
    if (notes) body.notes = notes;
    const data = await apiCall("/v1/ai/credits/client/allocate", "POST", body);
    return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
  }
);

// Start the server
async function main() {
  API_KEY = await getApiKey();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch(console.error);
