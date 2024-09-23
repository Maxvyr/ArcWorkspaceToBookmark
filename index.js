const fs = require("fs").promises;
const path = require("path");
const os = require("os");

async function main() {
  try {
    const data = await readJson();
    const html = convertJsonToHtml(data);
    await writeHtml(html);
    console.log("Done!");
  } catch (error) {
    console.error("An error occurred:", error);
  }
}

async function readJson() {
  console.log("Reading JSON...");

  const filename = "StorableSidebar.json";
  let libraryPath;

  if (process.platform === "win32") {
    const arcRootParentPath = path.join(os.homedir(), "AppData", "Local", "Packages");
    const arcRootPaths = (await fs.readdir(arcRootParentPath))
      .filter((f) => f.startsWith("TheBrowserCompany.Arc"))
      .map((f) => path.join(arcRootParentPath, f));

    if (arcRootPaths.length !== 1) {
      throw new Error("Arc installation directory not found");
    }

    libraryPath = path.join(arcRootPaths[0], "LocalCache", "Local", "Arc", filename);
  } else {
    libraryPath = path.join(os.homedir(), "Library", "Application Support", "Arc", filename);
  }

  let data = {};

  try {
    data = JSON.parse(await fs.readFile(filename, "utf-8"));
    console.log(`> Found ${filename} in current directory.`);
  } catch (error) {
    try {
      data = JSON.parse(await fs.readFile(libraryPath, "utf-8"));
      console.log(`> Found ${filename} in Library directory.`);
    } catch (error) {
      console.error('> File not found. Look for the "StorableSidebar.json" file within the "~/Library/Application Support/Arc/" folder.');
      throw new Error("File not found");
    }
  }

  return data;
}

function convertJsonToHtml(jsonData) {
  console.log("convertJsonToHtml", jsonData);
  const containers = jsonData.sidebar.containers;

  console.log("containers", containers);

  const topAppsContainerIDs = containers.findIndex((i) => "topAppsContainerIDs" in i);

  // console.log("containers[topAppsContainerIDs]", containers[topAppsContainerIDs]);
  // console.log("containers[topAppsContainerIDs].spaces", containers[topAppsContainerIDs].spaces);
  // console.log("containers[topAppsContainerIDs].items", containers[topAppsContainerIDs].items);

  const spaces = getSpaces(containers[topAppsContainerIDs].spaces);
  const items = containers[topAppsContainerIDs].items;

  const bookmarks = convertToBookmarks(spaces, items);
  const htmlContent = convertBookmarksToHtml(bookmarks);

  return htmlContent;
}

function getSpaces(spaces) {
  console.log("Getting spaces...");

  console.log(spaces);

  const spacesNames = { pinned: {}, unpinned: {} };
  let spacesCount = 0;
  let n = 1;

  for (const space of spaces) {
    let title = space.title || `Space ${n++}`;

    if (typeof space === "object") {
      const containers = space.newContainerIDs;

      for (let i = 0; i < containers.length; i++) {
        if (typeof containers[i] === "object") {
          if ("pinned" in containers[i]) {
            spacesNames.pinned[containers[i + 1]] = title;
          } else if ("unpinned" in containers[i]) {
            spacesNames.unpinned[containers[i + 1]] = title;
          }
        }
      }

      spacesCount++;
    }
  }

  console.log(`> Found ${spacesCount} spaces.`);
  return spacesNames;
}

function convertToBookmarks(spaces, items) {
  console.log("Converting to bookmarks...");

  const bookmarks = { bookmarks: [] };
  let bookmarksCount = 0;
  const itemDict = Object.fromEntries(items.filter((item) => typeof item === "object").map((item) => [item.id, item]));

  function recurseIntoChildren(parentId) {
    const children = [];
    for (const [itemId, item] of Object.entries(itemDict)) {
      if (item.parentID === parentId) {
        if (item.data && item.data.tab) {
          children.push({
            title: item.title || item.data.tab.savedTitle || "",
            type: "bookmark",
            url: item.data.tab.savedURL || "",
          });
          bookmarksCount++;
        } else if (item.title) {
          const childFolder = {
            title: item.title,
            type: "folder",
            children: recurseIntoChildren(itemId),
          };
          children.push(childFolder);
        }
      }
    }
    return children;
  }

  for (const [spaceId, spaceName] of Object.entries(spaces.pinned)) {
    const spaceFolder = {
      title: spaceName,
      type: "folder",
      children: recurseIntoChildren(spaceId),
    };
    bookmarks.bookmarks.push(spaceFolder);
  }

  console.log(`> Found ${bookmarksCount} bookmarks.`);
  return bookmarks;
}

function convertBookmarksToHtml(bookmarks) {
  console.log("Converting bookmarks to HTML...");

  let htmlStr = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

  function traverseDict(d, level = 1) {
    const indent = "\t".repeat(level);
    for (const item of d) {
      if (item.type === "folder") {
        htmlStr += `\n${indent}<DT><H3>${item.title}</H3>`;
        htmlStr += `\n${indent}<DL><p>`;
        traverseDict(item.children, level + 1);
        htmlStr += `\n${indent}</DL><p>`;
      } else if (item.type === "bookmark") {
        htmlStr += `\n${indent}<DT><A HREF="${item.url}">${item.title}</A>`;
      }
    }
  }

  traverseDict(bookmarks.bookmarks);
  htmlStr += "\n</DL><p>";

  console.log("> HTML converted.");
  return htmlStr;
}

async function writeHtml(htmlContent) {
  console.log("Writing HTML...");

  const currentDate = new Date().toISOString().split("T")[0].replace(/-/g, "_");
  const outputFile = `arc_bookmarks_${currentDate}.html`;

  await fs.writeFile(outputFile, htmlContent, "utf-8");
  console.log(`> HTML written to ${outputFile}.`);
}

main();
