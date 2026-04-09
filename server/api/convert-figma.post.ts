import { GoogleGenerativeAI } from "@google/generative-ai";
import { v4 as uuidv4 } from 'uuid';
import fs from 'node:fs';
import path from 'node:path';
import { fetchFigmaData } from "../utils/figmaService";

const HISTORY_FILE = path.resolve(process.cwd(), "history.json");

const saveToHistory = (record: any) => {
    let history = [];
    try {
        if (fs.existsSync(HISTORY_FILE)) {
            history = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
        }
    } catch (e) { history = []; }
    history.unshift(record);
    if (history.length > 20) history.pop();
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2));
};

export default defineEventHandler(async (event) => {
    const body = await readBody(event);
    const { fileKey, nodeId, existingCss, cssFileName } = body;

    if (!fileKey) throw createError({ statusCode: 400, statusMessage: "缺少 File Key" });

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw createError({ statusCode: 500, statusMessage: "未找到 API Key。" });

    const genAI = new GoogleGenerativeAI(apiKey);
    
    const geminiModel = genAI.getGenerativeModel({
        model: "gemini-3-flash-preview", 
        generationConfig: { 
            temperature: 0.2, 
        } 
    });

    try {
        console.log(`处理开始... 文件：${fileKey}`);

        const figmaResult = await fetchFigmaData(fileKey, nodeId);
        const rawHtml = figmaResult.html; 
        const originalWidth = figmaResult.width;
        const originalHeight = figmaResult.height;

        if (!rawHtml) throw new Error("Figma 数据为空。");

        console.log(`正在生成 HTML（全模式）...`);

        let htmlSystemInstruction = `
        你不是一个创意作家。你是一个严格的代码转换引擎。

        严格不可违反的规则（VERBOSITY RULES）：
        1. **不要害怕重复（NO SUMMARIZATION）：**
           - 如果数据中有20个相同的"卡片"，HTML 输出中也要有20个 <div> 块。
           - 绝对不要写 "Repeat x times"、"..." 或 "" 。
           - 如果列表中有10个项目，就把10个都写出来。不要尝试缩短代码。长代码意味着你的成功。

        2. **图片和图标：**
           - **图标：** 如果元素是图标、箭头、logo 或矢量图形；使用合适的 'FontAwesome 6' class（例如：<i class="fa-solid fa-user"></i>）。
           - **图片：** 对于大图片区域：使用 <img src="https://placehold.co/${Math.round(originalWidth/4)}x200?text=Img" alt="图片" class="img-fluid" />。
           - 绝对不要留下空的、无意义的 <div>。

        3. **结构和语义：**
           - 使用 <header>、<nav>、<main>、<section>、<footer> 标签创建语义化 HTML。
           - 使用 BEM（Block Element Modifier）结构命名 class。

        输出格式：
        只返回 HTML 代码块 (\`\`\`html ... \`\`\`)。
        `;
        
        let htmlUserPrompt = `要处理的数据：\n${rawHtml}`;

        const htmlResult = await geminiModel.generateContent([htmlSystemInstruction, htmlUserPrompt]);
        let generatedHtml = htmlResult.response.text().replace(/```html/g, "").replace(/```/g, "").trim();

        console.log(`正在生成 CSS...`);

        let cssSystemInstruction = `
        你是一位高级 CSS 工程师。根据 HTML 结构编写现代 CSS。

        布局规则（防止偏移）：
        1. **定位（绝对定位禁止）：**
           - 绝对不要对主框架（layout）使用 'position: absolute'。
           - 只使用 Flexbox（display: flex, gap）或 Grid。
           - 'position: absolute' 只可用于小徽章（badges）。

        2. **可见性保证：**
           - 对于有背景色但内部空的盒子（装饰形状），必须设置 'min-width' 和 'min-height'。否则它们不可见。
           - 为防止文本溢出，添加 'word-break: break-word'。

        3. **现代风格：**
           - 在 :root 变量中定义颜色。
           - 字体和颜色完全从原始数据中获取。

        输出格式：
        只返回 CSS 代码 (\`\`\`css ... \`\`\`)。
        `;

        let cssUserPrompt = `
        HTML 结构：
        ${generatedHtml}

        原始数据参考：
        ${rawHtml.substring(0, 30000)}
        ${existingCss ? `注意：用户有自己的 CSS 文件。你只需补充缺失的布局/定位代码。` : ''}
        `;

        const cssResult = await geminiModel.generateContent([cssSystemInstruction, cssUserPrompt]);
        let generatedCss = cssResult.response.text().replace(/```css/g, "").replace(/```/g, "").trim();

        const baseCss = `
        img { max-width: 100%; display: block; object-fit: cover; }
        .ai-placeholder {
            background-color: #e2e8f0; display: flex; align-items: center; justify-content: center;
            color: #64748b; font-weight: 600; border-radius: 8px; min-height: 50px;
        }
        i.fa-solid, i.fa-regular, i.fa-brands { font-size: 1.2em; color: inherit; }
        `;

        const finalStyle = `${baseCss}${existingCss ? `\n/* USER CSS */\n${existingCss}` : ''}\n/* AI CSS */\n${generatedCss}`;
        

        const finalHtml = `<!DOCTYPE html>
<html lang="zh">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <title>AI Preview - Gemini 3 Flash</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        :root { --bg-body: #f1f5f9; }
        body { 
            font-family: 'Inter', sans-serif; 
            background-color: var(--bg-body); 
            min-height: 100vh; 
            display: flex; 
            justify-content: center; 
            align-items: flex-start;
            padding: 40px; 
        }
        .preview-wrapper { 
            background: white; 
            width: 100%; 
            max-width: ${originalWidth}px; 
            min-height: ${originalHeight}px; 
            position: relative; 
            box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25); 
            border-radius: 16px; 
            overflow: hidden; 
            display: flex; 
            flex-direction: column; 
        }
        ${finalStyle}
    </style>
</head>
<body>
    <div class="preview-wrapper">
        ${generatedHtml}
    </div>
</body>
</html>`;

        const record = {
            id: uuidv4(),
            date: new Date().toLocaleString("zh-CN"),
            fileKey, nodeId,
            cssFileName: cssFileName || (existingCss ? "Custom CSS" : "No CSS"),
            result: { html: finalHtml, cleanHtml: generatedHtml, newCss: generatedCss, existingCss }
        };

        saveToHistory(record);
        console.log("处理完成！");
        return record.result;

    } catch (error: any) {
        console.error("错误：", error.message);
        throw createError({ statusCode: 500, statusMessage: error.message || "服务器错误" });
    }
});