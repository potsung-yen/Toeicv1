// ==========================================
// 全域變數與資料庫初始化 (含自動去重機制)
// ==========================================
function removeDuplicateWords(dataArray) {
    if (!Array.isArray(dataArray)) return [];
    const seen = new Set();
    return dataArray.filter(item => {
        if (!item || !item.english) return false;
        const cleanKey = item.english.trim().toLowerCase();
        if (seen.has(cleanKey)) {
            return false;
        }
        seen.add(cleanKey);
        return true;
    });
}

let rawWordList = typeof SpellingHeroData !== 'undefined' ? SpellingHeroData : [];
let wordList = removeDuplicateWords(rawWordList);

let currentPlayer = "冒險王";
let currentWord = {};

let currentRoundQueue = [];
let nextRoundQueue = [];    
let sessionTotalWords = 0;  
let masteredWords = 0;      
let currentRoundIndex = 0;  
let roundNumber = 1;        

let playerData = { score: 0, errorCounts: {}, customGroups: {}, unknownWords: [], testedWords: [] }; 

document.addEventListener("DOMContentLoaded", () => {
    loadUserData();
    
    const englishInput = document.getElementById("englishInput");
    if (englishInput) {
        englishInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter" && document.getElementById("submitBtn").style.display !== "none") {
                checkAnswer();
            }
        });
    }
    
    const searchInput = document.getElementById("searchInput");
    if (searchInput) {
        searchInput.addEventListener("keypress", (e) => {
            if (e.key === "Enter") searchWord();
        });
    }
});

// ==========================================
// 資料庫讀取與儲存
// ==========================================
function loadUserData() {
    const nameInput = document.getElementById("playerName");
    if (nameInput) {
        currentPlayer = nameInput.value.trim() || "冒險王";
    }
    
    let data = localStorage.getItem(`SpHero_${currentPlayer}`);
    if (data) {
        playerData = JSON.parse(data);
        if (!playerData.errorCounts) playerData.errorCounts = {};
        if (!playerData.customGroups) playerData.customGroups = {};
        if (!playerData.unknownWords) playerData.unknownWords = [];
        if (!playerData.testedWords) playerData.testedWords = []; 
    } else {
        playerData = { score: 0, errorCounts: {}, customGroups: {}, unknownWords: [], testedWords: [] };
    }
    
    const scoreElem = document.getElementById("score");
    if (scoreElem) scoreElem.innerText = playerData.score;
    
    updateDashboardUI();
    updateGroupSelect();
    updateUnknownWordsUI(); 
}

function saveUserData() {
    localStorage.setItem(`SpHero_${currentPlayer}`, JSON.stringify(playerData));
}

function resetTestedWords() {
    if (confirm("⚠️ 確定要清除所有的「已測驗」進度嗎？\n(您的總分、錯誤次數與自訂群組都會保留)")) {
        playerData.testedWords = [];
        saveUserData();
        updateGroupSelect();
        alert("✅ 學習計畫進度已成功重置！");
    }
}

// ==========================================
// 系統自動分級與選單邏輯
// ==========================================
function getSystemLevel(errCount) {
    if (errCount >= 10) return "advanced";   
    if (errCount >= 3) return "intermediate"; 
    return "beginner";                       
}

function getSystemLevelName(level) {
    if (level === "advanced") return "🔴 高級 (錯 10次+)";
    if (level === "intermediate") return "🟡 中級 (錯 3-9次)";
    return "🟢 初級 (錯 0-2次)";
}

function updateGroupSelect() {
    const select = document.getElementById("groupSelect");
    const planSelect = document.getElementById("planSelect");
    if (!select) return;
    select.innerHTML = "";
    
    let plan = planSelect ? planSelect.value : "free";
    let untestedWords = wordList.filter(w => !playerData.testedWords.includes(w.english.toLowerCase()));

    if (plan === "daily") {
        select.add(new Option(`🎲 每日隨機 40 題 (未測: ${untestedWords.length})`, "daily_40"));
        select.add(new Option(`🎲 每日隨機 20 題 (未測: ${untestedWords.length})`, "daily_20"));
        select.add(new Option(`🎲 每日隨機 10 題 (未測: ${untestedWords.length})`, "daily_10"));
        
    } else if (plan === "week" || plan === "month") {
        let days = plan === "week" ? 7 : 30;
        let chunkSize = Math.ceil(wordList.length / days);
        
        for(let i = 0; i < days; i++) {
            let start = i * chunkSize;
            let end = Math.min(start + chunkSize, wordList.length);
            if (start >= wordList.length) break;

            let chunkWords = wordList.slice(start, end);
            let chunkUntested = chunkWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase())).length;

            let label = plan === "week" ? `📅 第 ${i+1} 天任務` : `🗓️ 第 ${i+1} 天任務`;
            let status = chunkUntested === 0 ? "(✅已完成)" : `(剩餘 ${chunkUntested} 題未測)`;
            select.add(new Option(`${label}${status}`, `chunk_${start}_${end}`));
        }
    } else {
        // 自由題庫模式
        let counts = { beginner: 0, intermediate: 0, advanced: 0 };
        wordList.forEach(w => {
            let errCount = playerData.errorCounts[w.english.toLowerCase()] || 0;
            counts[getSystemLevel(errCount)]++;
        });

        select.add(new Option(`📚 全部單字 (${wordList.length} 題)`, "all"));
        if (counts.beginner > 0) select.add(new Option(`${getSystemLevelName("beginner")} - ${counts.beginner}題`, "sys_beginner"));
        if (counts.intermediate > 0) select.add(new Option(`${getSystemLevelName("intermediate")} - ${counts.intermediate}題`, "sys_intermediate"));
        if (counts.advanced > 0) select.add(new Option(`${getSystemLevelName("advanced")} - ${counts.advanced}題`, "sys_advanced"));

        // 自訂群組
        Object.keys(playerData.customGroups).forEach(groupName => {
            let size = playerData.customGroups[groupName].length;
            if (size > 0) select.add(new Option(`📁 ${groupName} (${size} 題)`, `cust_${groupName}`));
        });

        // GEPT 分級過濾
        let geptSet = new Set();
        wordList.forEach(w => { if (w.gept_level) geptSet.add(w.gept_level); });
        if (geptSet.size > 0) {
            geptSet.forEach(lvl => {
                let lvlWords = wordList.filter(w => w.gept_level === lvl);
                let untestedCount = lvlWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase())).length;
                select.add(new Option(`🏅 GEPT ${lvl} (剩 ${untestedCount} 題 / 共 ${lvlWords.length})`, `gept_${lvl}`));
            });
        }

        // TOEIC 情境分類
        let categorySet = new Set();
        wordList.forEach(w => {
            let cat = w.toeic_category || w.category;
            if (cat) categorySet.add(cat);
        });
        
        if (categorySet.size > 0) {
            categorySet.forEach(cat => {
                let catWords = wordList.filter(w => (w.toeic_category || w.category) === cat);
                let untestedCount = catWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase())).length;
                select.add(new Option(`🏢 情境：${cat} (剩 ${untestedCount} 題 / 共 ${catWords.length})`, `cat_${cat}`));
            });
        }
    }
}

// ==========================================
// 🗂️ 單字管理後台 (Dashboard) 邏輯
// ==========================================
function toggleDashboard() {
    const dash = document.getElementById("dashboardArea");
    if (!dash) return;
    dash.style.display = dash.style.display === "none" ? "block" : "none";
    if (dash.style.display === "block") updateDashboardUI();
}

function createCustomGroup() {
    const nameInput = document.getElementById("newGroupName");
    if (!nameInput) return;
    const groupName = nameInput.value.trim();
    if (!groupName) return alert("請輸入組別名稱！");
    if (playerData.customGroups[groupName]) return alert("這個組別已經存在囉！");

    playerData.customGroups[groupName] = [];
    saveUserData();
    nameInput.value = "";
    alert(`✅ 成功建立組別：${groupName}`);
    updateDashboardUI();
    updateGroupSelect();
}

function assignWordToGroup(wordEnglish, selectElement) {
    const groupName = selectElement.value;
    const wordKey = wordEnglish.toLowerCase();

    Object.keys(playerData.customGroups).forEach(g => {
        playerData.customGroups[g] = playerData.customGroups[g].filter(w => w !== wordKey);
    });

    if (groupName !== "none" && playerData.customGroups[groupName]) {
        playerData.customGroups[groupName].push(wordKey);
    }
    saveUserData();
    updateGroupSelect(); 
}

function updateDashboardUI() {
    const tbody = document.getElementById("wordTableBody");
    if (!tbody) return;
    tbody.innerHTML = "";

    const customGroupKeys = Object.keys(playerData.customGroups);
    let groupOptionsHTML = `<option value="none">-- 不加入 --</option>`;
    customGroupKeys.forEach(g => { groupOptionsHTML += `<option value="${g}">${g}</option>`; });

    wordList.forEach((w) => {
        let wordKey = w.english.toLowerCase();
        let errCount = playerData.errorCounts[wordKey] || 0;
        let sysLevel = getSystemLevel(errCount);
        let sysLevelName = getSystemLevelName(sysLevel);
        
        let currentGroup = "none";
        customGroupKeys.forEach(g => {
            if (playerData.customGroups[g].includes(wordKey)) currentGroup = g;
        });

        let tr = document.createElement("tr");
        tr.style.borderBottom = "1px solid #dfe6e9";
        tr.innerHTML = `
            <td style="padding: 10px; font-weight:bold;">${w.english}<br><span style="font-size:12px; color:#636e72; font-weight:normal;">${w.chinese}</span></td>
            <td style="padding: 10px; color: ${errCount > 0 ? '#d63031' : '#2d3436'}; font-weight: bold;">${errCount} 次</td>
            <td style="padding: 10px;">${sysLevelName}</td>
            <td style="padding: 10px;"><select onchange="assignWordToGroup('${w.english}', this)" style="padding:5px; border-radius:5px;">${groupOptionsHTML}</select></td>
        `;
        tr.querySelector('select').value = currentGroup;
        tbody.appendChild(tr);
    });
}

// ==========================================
// 🚀 遊戲核心：測試與無限複測輪迴邏輯
// ==========================================
function startGame() {
    const groupSelect = document.getElementById("groupSelect");
    if (!groupSelect) return;
    const selectedGroup = groupSelect.value;
    let initialQueue = [];

    if (selectedGroup === "all") {
        initialQueue = [...wordList];
    } else if (selectedGroup.startsWith("sys_")) {
        const targetLevel = selectedGroup.replace("sys_", "");
        initialQueue = wordList.filter(w => getSystemLevel(playerData.errorCounts[w.english.toLowerCase()] || 0) === targetLevel);
    } else if (selectedGroup.startsWith("cust_")) {
        const groupName = selectedGroup.replace("cust_", "");
        const wordsInGroup = playerData.customGroups[groupName] || [];
        initialQueue = wordList.filter(w => wordsInGroup.includes(w.english.toLowerCase()));
    } else if (selectedGroup.startsWith("daily_")) {
        let count = parseInt(selectedGroup.split("_")[1]);
        let untested = wordList.filter(w => !playerData.testedWords.includes(w.english.toLowerCase()));
        if (untested.length === 0) {
            alert("🎉 恭喜！您已經測驗完題庫所有的單字！請至管理後台重置進度以重新開始。");
            return;
        }
        initialQueue = untested.sort(() => Math.random() - 0.5).slice(0, count);
    } else if (selectedGroup.startsWith("chunk_")) {
        const parts = selectedGroup.split("_");
        const start = parseInt(parts[1]);
        const end = parseInt(parts[2]);
        let chunkWords = wordList.slice(start, end);
        initialQueue = chunkWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase()));
        if (initialQueue.length === 0) {
            alert("✅ 這個群組的單字您都已經測驗過囉！請選擇其他群組或前往後台重置進度。");
            return;
        }
    } else if (selectedGroup.startsWith("gept_")) {
        const lvlName = selectedGroup.replace("gept_", "");
        let lvlWords = wordList.filter(w => w.gept_level === lvlName);
        initialQueue = lvlWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase()));
        if (initialQueue.length === 0) {
            alert(`✅ 「GEPT ${lvlName}」的單字您都已經測驗過囉！請重置進度或選擇其他任務。`);
            return;
        }
    } else if (selectedGroup.startsWith("cat_")) {
        const catName = selectedGroup.replace("cat_", "");
        let catWords = wordList.filter(w => (w.toeic_category || w.category) === catName);
        initialQueue = catWords.filter(w => !playerData.testedWords.includes(w.english.toLowerCase()));
        if (initialQueue.length === 0) {
            alert(`✅ 「${catName}」情境的單字您都已經測驗過囉！請重置進度或選擇其他情境。`);
            return;
        }
    }

    if (initialQueue.length === 0) return alert("❌ 這個題庫目前沒有單字喔！");

    currentRoundQueue = [...initialQueue].sort(() => Math.random() - 0.5); 
    sessionTotalWords = currentRoundQueue.length;
    masteredWords = 0;
    nextRoundQueue = [];
    currentRoundIndex = 0;
    roundNumber = 1;
    
    document.getElementById("setupArea").style.display = "none";
    document.getElementById("dashboardArea").style.display = "none";
    document.getElementById("gameArea").style.display = "block";
    document.getElementById("progressArea").style.display = "block";
    
    nextQuestion();
}

// 👇 替換為全新支援同義字模式的 nextQuestion() 👇
function nextQuestion() {
    if (currentRoundIndex >= currentRoundQueue.length) {
        if (nextRoundQueue.length > 0) {
            roundNumber++;
            alert(`🔥 準備進入第 ${roundNumber - 1} 次複測！\n還有 ${nextRoundQueue.length} 個單字需要克服，加油！`);
            currentRoundQueue = [...nextRoundQueue].sort(() => Math.random() - 0.5); 
            nextRoundQueue = [];
            currentRoundIndex = 0;
        } else {
            alert(`🎉 恭喜！您已完美通關本組別的所有單字！\n總得分：${playerData.score}`);
            location.reload(); 
            return;
        }
    }

    currentWord = currentRoundQueue[currentRoundIndex];
    let modeElem = document.querySelector('input[name="gameMode"]:checked');
    let mode = modeElem ? modeElem.value : "spelling";
    
    // 💡 判斷當前是否為選擇題或同義字模式
    let isChoiceMode = mode.includes("choice");
    let isSynonymMode = mode.includes("synonym");
    
    document.getElementById("nextBtn").style.display = "none";
    document.getElementById("feedbackMsg").innerText = "";
    
    let geptBadge = currentWord.gept_level ? `<span class="badge-gept">${currentWord.gept_level}</span><br>` : "";
    let hintText = currentWord.chinese;
    
    // 💡 同義字模式邏輯
    if (isSynonymMode) {
        if (currentWord.synonyms && currentWord.synonyms !== "無") {
            hintText = `<span style="color: #7f8c8d; font-size: 0.8em;">🔄 提示同義字：</span><br><span style="color: #d35400;">${currentWord.synonyms}</span>`;
        } else {
            // 如果該單字沒有同義字，防呆退回顯示中文
            hintText = `<span style="color: #7f8c8d; font-size: 0.8em;">(此單字無同義字，顯示原意)</span><br>${currentWord.chinese}`;
        }
    }
    
    document.getElementById("chineseHint").innerHTML = `${geptBadge}${hintText}`;

    let overallPercent = (masteredWords / sessionTotalWords) * 100;
    document.getElementById("overallProgressBar").style.width = `${overallPercent}%`;
    document.getElementById("overallProgressText").innerText = `${masteredWords} /${sessionTotalWords}`;

    let roundPercent = (currentRoundIndex / currentRoundQueue.length) * 100;
    document.getElementById("roundProgressBar").style.width = `${roundPercent}%`;
    document.getElementById("roundProgressText").innerText = `${currentRoundIndex + 1} /${currentRoundQueue.length}`;
    document.getElementById("roundLabel").innerText = roundNumber === 1 ? "🔄 本回合進度 (初測)" : `🔄 本回合進度 (第 ${roundNumber - 1} 次複測)`;

    const sentenceHint = document.getElementById("sentenceHint");
    if (currentWord.sentence) {
        const cleanTarget = currentWord.english.replace(/^(a |an |the |to )/i, '').replace(/\([^)]*\)/g, '').trim();
        const regex = new RegExp(cleanTarget, 'gi');
        sentenceHint.innerText = currentWord.sentence.replace(regex, "________");
    } else {
        sentenceHint.innerText = "";
    }

    if (!isChoiceMode) {
        // 拼字模式 (一般拼字 & 同義字拼字 共用邏輯)
        document.getElementById("spellingArea").style.display = "flex";
        document.getElementById("choiceArea").style.display = "none";
        const englishInput = document.getElementById("englishInput");
        englishInput.disabled = false;
        englishInput.value = "";
        document.getElementById("submitBtn").style.display = "inline-block";
        englishInput.focus();
    } else {
        // 選擇題模式 (一般選擇 & 同義字選擇 共用邏輯)
        document.getElementById("spellingArea").style.display = "none";
        document.getElementById("choiceArea").style.display = "flex";
        renderChoiceOptions();
    }
}

function renderChoiceOptions() {
    const choiceArea = document.getElementById("choiceArea");
    choiceArea.innerHTML = "";
    let wrongOptions = wordList.filter(w => w.english.toLowerCase() !== currentWord.english.toLowerCase());
    wrongOptions.sort(() => Math.random() - 0.5);
    
    let options = [currentWord, ...wrongOptions.slice(0, 3)].sort(() => Math.random() - 0.5);
    options.forEach(opt => {
        let btn = document.createElement("button");
        btn.className = "option-btn";
        btn.innerText = opt.english;
        btn.onclick = () => checkChoiceAnswer(btn, opt.english);
        choiceArea.appendChild(btn);
    });
}

function checkAnswer() {
    const userInput = document.getElementById("englishInput").value.trim().toLowerCase();
    if (!userInput) return; 
    processResult(userInput, false);
}

function checkChoiceAnswer(clickedBtn, selectedWord) {
    const choiceArea = document.getElementById("choiceArea");
    choiceArea.querySelectorAll(".option-btn").forEach(b => b.disabled = true);
    
    if (selectedWord.toLowerCase() === currentWord.english.toLowerCase()) {
        clickedBtn.style.backgroundColor = "#00b894";
        clickedBtn.style.color = "white";
    } else {
        clickedBtn.style.backgroundColor = "#d63031";
        clickedBtn.style.color = "white";
        choiceArea.querySelectorAll(".option-btn").forEach(b => {
            if (b.innerText.toLowerCase() === currentWord.english.toLowerCase()) {
                b.style.backgroundColor = "#00b894";
                b.style.color = "white";
            }
        });
    }
    processResult(selectedWord, true);
}

function processResult(userInput, isChoiceMode) {
    const wordKey = currentWord.english.toLowerCase();
    let isCorrect = (userInput.toLowerCase() === wordKey);
    const feedback = document.getElementById("feedbackMsg");

    if (!playerData.testedWords.includes(wordKey)) {
        playerData.testedWords.push(wordKey);
    }

    if (isCorrect) {
        feedback.innerText = "✨ 答對了！";
        feedback.className = "feedback correct";
        playerData.score += 10;
        masteredWords++; 
    } else {
        feedback.innerText = `❌ 錯誤！正解: ${currentWord.english}`;
        feedback.className = "feedback wrong";
        playerData.errorCounts[wordKey] = (playerData.errorCounts[wordKey] || 0) + 1;
        nextRoundQueue.push(currentWord);
    }

    if (currentWord.sentence) document.getElementById("sentenceHint").innerText = currentWord.sentence;
    
    saveUserData(); 
    document.getElementById("score").innerText = playerData.score;

    if (!isChoiceMode) {
        document.getElementById("englishInput").disabled = true;
        document.getElementById("submitBtn").style.display = "none";
    }

    currentRoundIndex++; 

    let overallPercent = (masteredWords / sessionTotalWords) * 100;
    document.getElementById("overallProgressBar").style.width = `${overallPercent}%`;
    document.getElementById("overallProgressText").innerText = `${masteredWords} /${sessionTotalWords}`;
    let roundPercent = (currentRoundIndex / currentRoundQueue.length) * 100;
    document.getElementById("roundProgressBar").style.width = `${roundPercent}%`;

    if (document.getElementById("autoNext").checked) {
        setTimeout(() => nextQuestion(), isCorrect ? 1500 : 3500);
    } else {
        document.getElementById("nextBtn").style.display = "inline-block";
    }
}

function endGameEarly() {
    if (confirm("確定要提早結束本次測驗嗎？您的錯誤紀錄已保存。")) {
        location.reload();
    }
}

// ==========================================
// 輔助功能 (發音 / 解析 / 匯出錯題)
// ==========================================
function showWordInfo() {
    document.getElementById("modalWordTitle").innerText = currentWord.english;
    
    let youtubeLinkHTML = `<p><b>▶️ 影音發音：</b> <a href="https://www.youtube.com/results?search_query=how+to+pronounce+${encodeURIComponent(currentWord.english)}" target="_blank" style="color: #d63031; text-decoration: underline; font-weight: bold;">在 YouTube 上聽發音</a></p>`;
    
    // 相容新舊欄位
    let cat = currentWord.toeic_category || currentWord.category || "一般商務";
    let rootParse = currentWord.roots_parsing || currentWord.roots || "暫無資料";
    let geptHtml = currentWord.gept_level ? `<p><b>🏅 全民英檢：</b> <span style="color:#e67e22; font-weight:bold;">${currentWord.gept_level}</span></p>` : "";
    let rootFamilyHtml = currentWord.root_family && currentWord.root_family !== "無" ? `<p><b>🌳 字根家族：</b> <span style="color:#27ae60; font-weight:bold;">${currentWord.root_family}</span></p>` : "";

    document.getElementById("modalWordContent").innerHTML = `
        <p><b>📝 意思：</b> ${currentWord.chinese}</p>
        <p><b>🏢 類別：</b> <span style="color:#0984e3; font-weight:bold;">${cat}</span></p>
        ${geptHtml}${rootFamilyHtml}
        <p><b>🧬 字首字根解析：</b> <span style="color:#d35400;">${rootParse}</span></p>
        <p><b>🔄 同義字：</b> ${currentWord.synonyms || "無"}</p>
        <p><b>↔️ 反義字：</b> ${currentWord.antonyms || "無"}</p>
        <p><b>⚠️ 易混淆：</b> <span style="color:#c0392b;">${currentWord.confused || "無"}</span></p>
        ${youtubeLinkHTML}
    `;
    document.getElementById("infoModal").style.display = "flex";
}

function closeModal(id) { 
    const modal = document.getElementById(id);
    if (modal) modal.style.display = "none"; 
}

function speakWord() {
    if (!currentWord || !currentWord.english) return;
    let utterance = new SpeechSynthesisUtterance(currentWord.english);
    utterance.lang = 'en-US';
    window.speechSynthesis.speak(utterance);
}

function exportMistakes() {
    let mistakes = wordList.filter(w => (playerData.errorCounts[w.english.toLowerCase()] || 0) > 0);
    if (mistakes.length === 0) { alert("🎉 目前沒有錯題紀錄！"); return; }
    
    let csv = "\uFEFF英文單字,中文意思,累積錯誤次數\n" + mistakes.map(w => `"${w.english}","${w.chinese}","${playerData.errorCounts[w.english.toLowerCase()]}"`).join("\n");
    let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `我的錯題本.csv`;
    link.click();
}

// ==========================================
// 📖 字典查詢與「未收錄單字」自動捕捉系統
// ==========================================
function searchWord() {
    const searchInput = document.getElementById("searchInput");
    if (!searchInput) return;
    
    const query = searchInput.value.trim().toLowerCase();
    const resultArea = document.getElementById("searchResultArea");
    if (!query) { resultArea.style.display = "none"; return; }
    
    // 支援中英文模糊查詢
    const matches = wordList.filter(w => w.english.toLowerCase().includes(query) || (w.chinese && w.chinese.includes(query)));
    
    if (matches.length === 0) {
        if (!playerData.unknownWords.includes(query)) {
            playerData.unknownWords.push(query);
            saveUserData();
            updateUnknownWordsUI();
        }
        resultArea.innerHTML = `<p style="color: #d63031; font-weight: bold;">找不到與「${query}」相關的單字 😢<br><span style="font-size:14px; color:#636e72;">已自動將此單字加入待擴充清單！</span></p>`;
    } else {
        resultArea.innerHTML = matches.map(w => {
            let cat = w.toeic_category || w.category || "無分類";
            let geptBadge = w.gept_level ? `<span class="badge-gept" style="margin-left: 10px;">${w.gept_level}</span>` : "";
            let rootParse = w.roots_parsing || w.roots || "暫無資料";
            
            // 劍橋字典連結
            const dictLink = `https://dictionary.cambridge.org/zht/詞典/英語-漢語-繁體/${w.english}`;

            return `
            <div style="background: #fdfbfb; border: 1px solid #dfe6e9; padding: 15px; border-radius: 8px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05); border-left: 5px solid #0984e3;">
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #dfe6e9; padding-bottom: 8px; margin-bottom: 10px;">
                    <h3 style="margin: 0; color: #0984e3; font-size: 20px; font-weight: bold;">
                        ${w.english}${geptBadge}
                    </h3>
                    <div style="display: flex; gap: 8px;">
                        <button type="button" onclick="speakSpecificWord('${w.english}')" style="background-color: #00b894; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; font-size: 13px;">🔊 發音</button>
                        <a href="${dictLink}" target="_blank" style="background-color: #2d3436; color: white; text-decoration: none; padding: 5px 10px; border-radius: 5px; font-size: 13px; display: inline-block;">📚 字典</a>
                    </div>
                </div>
                
                <div style="font-size: 15px; margin-bottom: 8px;">
                    <span style="font-weight: bold; color: #2d3436;">${w.chinese}</span>
                </div>
                
                <div style="background: #ecf0f1; padding: 10px; border-radius: 5px; margin-bottom: 10px; color: #555; font-style: italic; font-size: 14px;">
                    <strong>💬 例句：</strong><br>
                    ${w.sentence || '暫無例句'}
                </div>
                
                <div style="color: #2c3e50; line-height: 1.6; font-size: 14px;">
                    <p style="margin: 2px 0;"><b>🏢 情境：</b> ${cat}</p>
                    <p style="margin: 2px 0;"><b>🧬 字根解析：</b> <span style="color:#d35400;">${rootParse}</span></p>
                    <p style="margin: 2px 0;"><b>🔄 同義字：</b> ${w.synonyms || "無"}</p>
                    <p style="margin: 2px 0;"><b>↔️ 反義字：</b> ${w.antonyms || "無"}</p>
                    <p style="margin: 2px 0;"><b>⚠️ 易混淆：</b> <span style="color:#c0392b;">${w.confused || "無"}</span></p>
                </div>
            </div>
            `;
        }).join("");
    }
    resultArea.style.display = "block";
}

// 獨立的發音函式，供查詢結果專用
function speakSpecificWord(text) {
    if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel(); // 避免連續點擊造成語音卡住排隊
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'en-US'; 
        utterance.rate = 0.9;
        window.speechSynthesis.speak(utterance);
    } else {
        alert("您的瀏覽器不支援語音功能。");
    }
}

function updateUnknownWordsUI() {
    const area = document.getElementById("unknownWordsArea");
    const countSpan = document.getElementById("unknownCount");
    const listDiv = document.getElementById("unknownWordsList");
    if (!area || !countSpan || !listDiv) return;

    if (!playerData.unknownWords || playerData.unknownWords.length === 0) {
        area.style.display = "none";
        return;
    }

    area.style.display = "block";
    countSpan.innerText = playerData.unknownWords.length;
    
    listDiv.innerHTML = playerData.unknownWords.map(word => 
        `<span style="background: white; border: 1px solid #fdcb6e; padding: 5px 10px; border-radius: 15px; font-weight: bold; color: #e17055; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">${word}</span>`
    ).join("");
}

function copyUnknownWordsPrompt() {
    if (!playerData.unknownWords || playerData.unknownWords.length === 0) return;
    
    const wordListStr = playerData.unknownWords.join(",\n");
    const prompt = `你現在是一位專業的英文老師與資料工程師。
請幫我針對以下這批單字，自動補齊資訊並輸出成 JSON 陣列。
必須「嚴格」依照以下的純 JSON 陣列格式輸出，不要包含任何 Markdown 程式碼區塊標記 (如 \`\`\`json)，直接輸出純文字格式的 JSON，讓我能直接複製到 JS 檔中：

[
  {
    "english": "單字",
    "chinese": "中文意思 (詞性)",
    "sentence": "實用例句 (符合該單字程度與情境，並確保無特殊跳脫字元衝突)。",
    "synonyms": "同義字1 (中文), 同義字2 (中文)",
    "antonyms": "反義字1 (中文) (若無則填 無)",
    "confused": "易混淆字 (中文) (若無則填 無)",
    "roots_parsing": "字根字首解析 (例如：re- (再) + sume (拿取) -> 重新開始。若無則填 無)",
    "root_family": "所屬字根家族名稱 (例如：sum/sumpt- 家族 (拿取/消耗)。若無關聯請填 無)",
    "toeic_category": "請『只能』從以下 10 個類別挑選 1 個：辦公室與行政、人事與管理、企劃與業務、財務與金融、出差與交通、住宿與餐飲、生產與製造、採購與物流、健康與醫療、地產與建築",
    "gept_level": "請『只能』從以下 4 個分級挑選 1 個：初級, 中級, 中高級, 高級",
    "youtube": "https://www.youtube.com/results?search_query=how+to+pronounce+單字"
  }
]

以下是需要處理的單字清單：
${wordListStr}`;

    const tempInput = document.createElement("textarea");
    tempInput.value = prompt;
    document.body.appendChild(tempInput);
    tempInput.select();
    document.execCommand("copy");
    document.body.removeChild(tempInput);
    
    alert("✅ AI 提示詞與待擴充單字已成功複製！\n\n請直接貼給 ChatGPT/Gemini 產生 JSON 陣列，然後接在您的 words.js 檔案最下方！");
}

function clearUnknownWords() {
    if (confirm("確定要清空這些尚未收錄的單字嗎？")) {
        playerData.unknownWords = [];
        saveUserData();
        updateUnknownWordsUI();
    }
}

// ==========================================
// 📥 下載完整資料庫單字清單 (CSV)
// ==========================================
function exportAllWords() {
    // 確保有資料可以匯出
    if (!wordList || wordList.length === 0) { 
        alert("❌ 目前資料庫中沒有任何單字！"); 
        return; 
    }
    
    // 加入 BOM (\uFEFF) 防止 Excel 開啟 CSV 時中文亂碼
    let csv = "\uFEFF英文單字,中文意思,情境類別,GEPT分級,字根家族\n" + 
        wordList.map(w => {
            let cat = w.toeic_category || w.category || "無分類";
            let gept = w.gept_level || "無";
            let root = w.root_family || "無";
            return `"${w.english}","${w.chinese}","${cat}","${gept}","${root}"`;
        }).join("\n");
        
    let blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    let link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `SpellingHero_完整單字庫比對檔.csv`;
    link.click();
}
