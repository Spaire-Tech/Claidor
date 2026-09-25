function tool(
  name: string,
  description: string,
  properties: Record<string, unknown>,
  required: readonly string[] = [],
): Record<string, unknown> {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      additionalProperties: false,
      ...(required.length > 0 ? { required: [...required] } : {}),
      properties,
    },
  };
}

const SHELL_PROPERTIES = {
  command: { type: "string", description: "The command to execute" },
  working_directory: {
    type: "string",
    description: "The absolute path to the working directory to execute the command in",
  },
  block_until_ms: {
    type: "number",
    description: "How long to block and wait for the command to complete (in milliseconds). Defaults to 30000ms (30 seconds).",
  },
};

const BOX_READ_DESCRIPTION = `Reads a file on your own computer (the box), the same filesystem Shell and CopyToBox act on. This is your default surface, including your own files under /home/box and /workspace. Use ExternalRead only for files on the user's computer.

Text files include line numbers and support offset/limit paging. Image files (jpeg/jpg, png, gif, webp) are returned inline so you can see them. PDF files are converted to text.`;

const BOX_SHELL_DESCRIPTION = `PROPOSE a command to run on your own computer (the box), the same filesystem Read and CopyToBox act on.
If you have this tool, note that you DO have the ability to run commands directly on that machine.
This is your default surface, including your own files under /home/box and /workspace. Do not claim you cannot access your computer if you have this tool.
When they ask you to use "your computer", the desktop, a browser you drive, or to look something up from a login-gated site, this is that machine.
In using these tools, adhere to the following guidelines:
1. Based on the contents of the conversation, you will be told if you are in the same shell as a previous step or a different shell.
2. If in a new shell, you should \`cd\` to the appropriate directory and do necessary setup in addition to running the command. By default, the shell will initialize in /workspace.
3. If in the same shell, LOOK IN CHAT HISTORY for your current working directory.
4. For ANY commands that would require user interaction, ASSUME THE USER IS NOT AVAILABLE TO INTERACT and PASS THE NON-INTERACTIVE FLAGS (e.g. --yes for npx).
5. If the command would use a pager, append \` | cat\` to the command.
6. Dont include any newlines in the command.
Commands wait up to block_until_ms milliseconds (default 30000). Prefer Read to read a file; use this for listing, measuring, and running.`;

const AWAIT_SHELL_DESCRIPTION = `Wait for a previously started Shell command that is still running in the background. Pass the terminal id or the same command's working directory if you have it. Do not invent a wait when no command is running.`;

const COMPUTER_DESCRIPTION = `Drive the graphical desktop on your own computer (the box): screenshot, click, type, key, scroll, move, drag, wait. This is the screen and browser window that belong to you on that shared machine. If you have this tool, you DO have a computer with a desktop — do not claim you cannot open sites, take screenshots, or use a browser. Prefer browser_* tools for page-level control when those are listed; use this for the desktop itself.`;

const SCREENSHOT_DESCRIPTION = `Take a screenshot of your own computer's desktop (the box). If you have this tool, you CAN see the screen. Prefer it when you need to look at the desktop; browser_take_screenshot is for the box browser page.`;

const TASK_DESCRIPTION = `Launch a specialized subagent for a focused job (computerUse, browserUse when offered, executor). The subagent runs on your computer and returns its findings. Use computerUse when the work is driving the graphical desktop or a login-gated site in the box browser. There is no video-watching subagent.`;

const WEB_SEARCH_DESCRIPTION = `Search the web and return relevant results. Use this for current information, documentation, and anything you do not already know. Prefer it over guessing.`;

const WEB_FETCH_DESCRIPTION = `Fetch content from a specified URL and return its contents in a readable markdown format. Use this tool when you need to retrieve and analyze webpage content. The URL must be a fully-formed http(s) URL. Localhost and private addresses are refused; public pages only.`;

const COPY_TO_BOX_DESCRIPTION = `Copy a file from the user's computer into your box, verbatim. Use this to bring a user's file onto your box so you can work on it with Shell or Read. Give the file's absolute path on the user's computer (the path your ExternalShell tool would use); it lands in /workspace/uploads by default, or at a box_path you choose.`;

const COPY_FROM_BOX_DESCRIPTION = `Copy a file from your box onto the user's actual computer, verbatim, where ExternalRead, ExternalShell, their editor, and apps can reach it. Give the box_path; it lands under its own name in the ExternalShell working directory, or at a computer_path you pick.`;

const SEND_TO_AGENT_DESCRIPTION = `Send a message to another agent or a group you belong to. Messaging is asynchronous: it is delivered and returns right away. You do not get a reply in this turn.`;

const GENERATE_IMAGE_DESCRIPTION = `Generate an image from a detailed description and save it on your box. Use this when the user asks you to make a picture, illustration, diagram, or similar.`;

const REQUEST_BOX_HELP_DESCRIPTION = `Hand your box's desktop to the user for a sign-in, SSO, 2FA, captcha, or payment step only they can do. A short instruction is shown over the box and in chat.`;

const UPDATE_STATE_DESCRIPTION = `Update your durable state: memory, routines, workflows, profile, settings, avatar. Only the fields you pass change.`;

const REACT_DESCRIPTION = `React to one of the USER's messages with a single emoji tapback. Use VERY sparingly, only when a reaction is the genuinely natural response.`;

const BROWSER_TOOL_SPECS: readonly { readonly name: string; readonly description: string; readonly required?: readonly string[]; readonly properties?: Record<string, unknown> }[] = [
  { name: "browser_navigate", description: "Navigate the box browser to a URL. By default reuses your tab; set newTab: true to open in a new tab.", required: ["url"], properties: { url: { type: "string" }, newTab: { type: "boolean" } } },
  { name: "browser_snapshot", description: "Capture a structured snapshot of the current page with [ref=eN] handles for interactive elements." },
  { name: "browser_click", description: "Click an element by ref from browser_snapshot.", required: ["ref"], properties: { ref: { type: "string" } } },
  { name: "browser_mouse_click_xy", description: "Click at viewport coordinates. Prefer browser_click with refs when possible.", required: ["x", "y"], properties: { x: { type: "number" }, y: { type: "number" } } },
  { name: "browser_type", description: "Type text into an input, textarea, or contenteditable element by ref.", required: ["ref", "text"], properties: { ref: { type: "string" }, text: { type: "string" } } },
  { name: "browser_fill", description: "Set the value of an input, textarea, or contenteditable element by ref.", required: ["ref", "value"], properties: { ref: { type: "string" }, value: { type: "string" } } },
  { name: "browser_select_option", description: "Select one or more options in a select element by ref.", required: ["ref", "values"], properties: { ref: { type: "string" }, values: { type: "array", items: { type: "string" } } } },
  { name: "browser_press_key", description: "Press a key in the browser page, for example Enter, Escape, Tab, ArrowDown, or a single character.", required: ["key"], properties: { key: { type: "string" } } },
  { name: "browser_scroll", description: "Scroll the page or scroll an element into view (pass its ref).", properties: { ref: { type: "string" } } },
  { name: "browser_drag", description: "Drag an element by ref to another ref or viewport coordinates.", required: ["sourceRef"], properties: { sourceRef: { type: "string" }, targetRef: { type: "string" }, x: { type: "number" }, y: { type: "number" } } },
  { name: "browser_get_bounding_box", description: "Get the viewport bounding box for an element ref.", required: ["ref"], properties: { ref: { type: "string" } } },
  { name: "browser_highlight", description: "Highlight an element by ref in the browser page for visual grounding.", required: ["ref"], properties: { ref: { type: "string" } } },
  { name: "browser_cdp", description: "Send a Chrome DevTools Protocol command to the target browser tab.", required: ["method"], properties: { method: { type: "string" }, params: { type: "object" } } },
  { name: "browser_tabs", description: "List, create, close, or select a browser tab.", required: ["action"], properties: { action: { type: "string", enum: ["list", "new", "close", "select"] }, viewId: { type: "string" } } },
  { name: "browser_take_screenshot", description: "Take a screenshot of the current page. Usually redundant: every browser action already returns one.", properties: { fullPage: { type: "boolean" } } },
];

export const GROK_BOT_HOST_TOOL_NAMES = [
  "Shell",
  "Read",
  "AwaitShell",
  "ExternalAwaitShell",
  "Computer",
  "Screenshot",
  "CopyToBox",
  "CopyFromBox",
  "Task",
  "WebSearch",
  "WebFetch",
  "SendToAgent",
  "GenerateImage",
  "RequestBoxHelp",
  "update_state",
  "ReactToMessage",
  ...BROWSER_TOOL_SPECS.map(spec => spec.name),
] as const;

export const GROK_BOT_BOX_TOOLS: readonly Record<string, unknown>[] = [
  tool("Shell", BOX_SHELL_DESCRIPTION, SHELL_PROPERTIES, ["command"]),
  tool("Read", BOX_READ_DESCRIPTION, {
    path: { type: "string", description: "The absolute path of the file to read on your own computer." },
    offset: { type: "number" },
    limit: { type: "number" },
  }, ["path"]),
  tool("AwaitShell", AWAIT_SHELL_DESCRIPTION, {
    block_until_ms: { type: "number" },
    path: { type: "string", description: "Optional terminals file or id of the running command." },
  }),
  tool("ExternalAwaitShell", "Wait for a previously started ExternalShell command on the user's computer.", {
    block_until_ms: { type: "number" },
    path: { type: "string" },
  }),
  tool("Computer", COMPUTER_DESCRIPTION, {
    action: { type: "string", enum: ["screenshot", "click", "move", "drag", "type", "key", "scroll", "wait"] },
    x: { type: "number" },
    y: { type: "number" },
    x2: { type: "number" },
    y2: { type: "number" },
    text: { type: "string" },
    key: { type: "string" },
    button: { type: "string", enum: ["left", "right", "middle"] },
    count: { type: "number" },
    direction: { type: "string", enum: ["up", "down", "left", "right"] },
    amount: { type: "number" },
    durationMs: { type: "number" },
    description: { type: "string" },
  }, ["action"]),
  tool("Screenshot", SCREENSHOT_DESCRIPTION, {}),
  tool("CopyToBox", COPY_TO_BOX_DESCRIPTION, {
    computer_path: { type: "string" },
    box_path: { type: "string" },
  }, ["computer_path"]),
  tool("CopyFromBox", COPY_FROM_BOX_DESCRIPTION, {
    box_path: { type: "string" },
    computer_path: { type: "string" },
  }, ["box_path"]),
  tool("Task", TASK_DESCRIPTION, {
    prompt: { type: "string", description: "The task for the subagent." },
    description: { type: "string" },
    subagent_type: { type: "string" },
  }, ["prompt"]),
  tool("WebSearch", WEB_SEARCH_DESCRIPTION, {
    search_term: { type: "string" },
    explanation: { type: "string" },
  }, ["search_term"]),
  tool("WebFetch", WEB_FETCH_DESCRIPTION, {
    url: { type: "string" },
  }, ["url"]),
  tool("SendToAgent", SEND_TO_AGENT_DESCRIPTION, {
    target_id: { type: "string" },
    message: { type: "string" },
  }, ["target_id", "message"]),
  tool("GenerateImage", GENERATE_IMAGE_DESCRIPTION, {
    description: { type: "string" },
    filename: { type: "string" },
    aspect_ratio: { type: "string" },
  }, ["description"]),
  tool("RequestBoxHelp", REQUEST_BOX_HELP_DESCRIPTION, {
    instruction: { type: "string" },
    reason: { type: "string", enum: ["auth", "captcha", "payment", "other"] },
    domain: { type: "string" },
  }, ["instruction"]),
  tool("update_state", UPDATE_STATE_DESCRIPTION, {
    target: { type: "string" },
    action: { type: "string" },
    fact: { type: "string" },
    name: { type: "string" },
    description: { type: "string" },
    path: { type: "string" },
  }, ["target", "action"]),
  tool("ReactToMessage", REACT_DESCRIPTION, {
    message_address: { type: "string" },
    emoji: { type: "string" },
  }, ["message_address", "emoji"]),
  ...BROWSER_TOOL_SPECS.map(spec => tool(spec.name, spec.description, spec.properties ?? {}, spec.required ?? [])),
];
