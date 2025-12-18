import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import {
 getAuth,
 onAuthStateChanged,
 signInAnonymously,
 signInWithCustomToken,
 createUserWithEmailAndPassword,
 signInWithEmailAndPassword,
 signOut
} from 'firebase/auth';
import {
 getFirestore,
 collection,
 doc,
 getDocs,
 setDoc,
 addDoc,
 deleteDoc,
 writeBatch,
 updateDoc
} from 'firebase/firestore';
import {
 BookOpen,
 CheckCircle,
 XCircle,
 RefreshCw,
 LogOut,
 Brain,
 Activity,
 AlertCircle,
 ChevronRight,
 Plus,
 Save,
 ArrowLeft,
 Upload,
 Download,
 FileText,
 Trash2,
 List,
 AlertTriangle,
 Search,
 History,
 Filter,
 Award,
 Home,
 GraduationCap
} from 'lucide-react';


// --- Configuration ---
const ADMIN_EMAIL = "2004ayumu0417@gmail.com"; // 管理者メールアドレス


// コース定義
const COURSES = [
 { id: 'med-study-app', name: '試験対策' },
 { id: 'cbt-prep-app', name: 'CBT対策' },
];


// --- Firebase Configuration (設定エリア) ---
// 【重要】Firebaseコンソールからコピーした内容で、以下の { ... } の中身を書き換えてください。
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {
  apiKey: "AIzaSyBUaylHYEZNXL2jqojtILTaU0RrunJ6Rq0",
  authDomain: "medical-study-a0154.firebaseapp.com",
  projectId: "medical-study-a0154",
  storageBucket: "medical-study-a0154.firebasestorage.app",
  messagingSenderId: "422680487740",
  appId: "1:422680487740:web:c9872f633f53469d7e6039"
};


// アプリの初期化
let app, auth, db;
let initError = null;
try {
 if (!firebaseConfig.apiKey || firebaseConfig.apiKey === "ここにあなたのAPIキー") {
   console.warn("APIキーが設定されていません");
 }
 app = initializeApp(firebaseConfig);
 auth = getAuth(app);
 db = getFirestore(app);
} catch (e) {
 console.error("Firebase Init Error:", e);
 initError = e.message;
}


// --- Helper: String Normalizer ---
const normalizeString = (str) => {
 if (!str) return '';
 let normalized = str.replace(/[Ａ-Ｚａ-ｚ０-９]/g, (s) => {
   return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
 });
 return normalized.replace(/\s+/g, '').toLowerCase();
};


// --- Helper: CSV Parser ---
const parseCSVLine = (text) => {
 const result = [];
 let current = '';
 let inQuote = false;
 for (let i = 0; i < text.length; i++) {
   const char = text[i];
   if (char === '"') {
     if (inQuote && text[i + 1] === '"') {
       current += '"';
       i++;
     } else {
       inQuote = !inQuote;
     }
   } else if (char === ',' && !inQuote) {
     result.push(current);
     current = '';
   } else {
     current += char;
   }
 }
 result.push(current);
 return result;
};


// --- Helper: Shuffle Array ---
const shuffleArray = (array) => {
 if (!Array.isArray(array)) return [];
 const newArray = [...array];
 for (let i = newArray.length - 1; i > 0; i--) {
   const j = Math.floor(Math.random() * (i + 1));
   [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
 }
 return newArray;
};


// --- Helper: Answer Matcher ---
const isAnswerMatch = (selectedOption, correctAnswer) => {
 if (!selectedOption || !correctAnswer) return false;
 if (selectedOption === correctAnswer) return true;
 const separators = ['.', ')', ' ', '、'];
 for (const sep of separators) {
   if (selectedOption.startsWith(correctAnswer + sep)) {
     return true;
   }
 }
 return false;
};


// --- Sample Data ---
const INITIAL_QUESTIONS = [
 {
   id: 'q1',
   displayId: '1_1',
   type: 'single',
   category: 'サンプル',
   questionText: 'これはサンプル問題です。選択肢1が正解です。',
   options: ['選択肢1', '選択肢2', '選択肢3', '選択肢4', '選択肢5'],
   correctAnswer: '選択肢1',
   explanation: 'これはサンプル解説です。管理画面からCSVをインポートしてください。'
 }
];


// --- Components ---
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false, size = 'normal' }) => {
 const baseStyle = "rounded-xl font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const sizeStyles = {
   normal: "px-4 py-3 text-base",
   large: "px-6 py-4 text-lg",
   small: "px-3 py-2 text-sm"
 };


 const variants = {
   primary: "bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200",
   secondary: "bg-white text-gray-700 border-2 border-gray-200 hover:bg-gray-50",
   success: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-emerald-200",
   warning: "bg-amber-500 text-white hover:bg-amber-600 shadow-amber-200",
   danger: "bg-red-50 text-red-600 border-2 border-red-100 hover:bg-red-100",
   dangerSolid: "bg-red-500 text-white hover:bg-red-600 shadow-red-200",
   outline: "bg-transparent text-blue-600 border-2 border-blue-100 hover:bg-blue-50"
 };


 return (
   <button
     onClick={onClick}
     className={`${baseStyle} ${sizeStyles[size]} ${variants[variant]} ${className}`}
     disabled={disabled}
   >
     {children}
   </button>
 );
};


const Input = ({ value, onChange, placeholder, type = "text", onKeyDown, ...props }) => (
 <input
   type={type}
   value={value}
   onChange={onChange}
   onKeyDown={onKeyDown}
   placeholder={placeholder}
   className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-lg bg-gray-50 focus:bg-white"
   {...props}
 />
);


// --- Main App ---
export default function App() {
 const [user, setUser] = useState(null);
 const [loading, setLoading] = useState(true);
 const [view, setView] = useState('auth');
 const [allQuestions, setAllQuestions] = useState([]); // 全データ保持用
 const [questions, setQuestions] = useState([]); // 出題用データ
 const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
 const [selectedOptions, setSelectedOptions] = useState([]);
 const [textInput, setTextInput] = useState('');
 const [showExplanation, setShowExplanation] = useState(false);
 const [mode, setMode] = useState('all');
 const [authMode, setAuthMode] = useState('login');
 const [email, setEmail] = useState('');
 const [password, setPassword] = useState('');
 const [authError, setAuthError] = useState('');
 const [userHistory, setUserHistory] = useState({});
 const [importStatus, setImportStatus] = useState('');
  // ★ Current App ID (Course Selection) with Persistence
 const [currentAppId, setCurrentAppId] = useState(() => {
   // ローカルストレージから前回の選択を復元
   const saved = localStorage.getItem('med-app-course-id');
   if (saved && COURSES.some(c => c.id === saved)) {
     return saved;
   }
   return COURSES[0].id;
 });


 // ★ コース選択が変更されたらローカルストレージに保存
 useEffect(() => {
   localStorage.setItem('med-app-course-id', currentAppId);
 }, [currentAppId]);


 // Quiz State
 const [isUnsure, setIsUnsure] = useState(false);
 const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 });
 const [prevAttempt, setPrevAttempt] = useState(null); // 前回の成績保持用


 // Custom Quiz State
 const [customBatch, setCustomBatch] = useState('');
 const [customCategory, setCustomCategory] = useState('');


 // Search State
 const [searchId, setSearchId] = useState('');


 // Admin State
 const [newQ, setNewQ] = useState({
   type: 'single', category: '', questionText: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: ''
 });
 const [adminSelectedIndices, setAdminSelectedIndices] = useState([]);
 const [deleteRange, setDeleteRange] = useState({ batch: '', start: '', end: '' });
 const [uploadBatchNum, setUploadBatchNum] = useState('1');


 // Quiz Hooks
 const currentQ = questions[currentQuestionIndex];
 const isLastQuestion = questions.length > 0 && currentQuestionIndex === questions.length - 1;
 const isReviewMode = mode === 'review';
 const canCheck = currentQ
   ? (currentQ.type === 'input' ? textInput.length > 0 : selectedOptions.length > 0)
   : false;


 // 選択肢シャッフル
 const currentOptions = useMemo(() => {
   if (!currentQ || !Array.isArray(currentQ.options) || currentQ.type === 'input') {
     return [];
   }
   return shuffleArray(currentQ.options);
 }, [currentQ]);


 // 正解データの正規化
 const normalizedCorrectAnswers = useMemo(() => {
   if (!currentQ) return [];
  
   let raws = Array.isArray(currentQ.correctAnswer)
       ? currentQ.correctAnswer
       : (typeof currentQ.correctAnswer === 'string' ? currentQ.correctAnswer.split('|') : [currentQ.correctAnswer]);
  
   if (Array.isArray(currentQ.options) && currentQ.options.length > 0) {
       return raws.map(ans => {
           let s = String(ans).trim();
           s = s.replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));
           if (/^\d+$/.test(s)) {
               const idx = parseInt(s, 10) - 1;
               if (idx >= 0 && idx < currentQ.options.length) {
                   return currentQ.options[idx];
               }
           }
           return ans;
       });
   }
   return raws;
 }, [currentQ]);


 // 現在の問題の統計情報
 const currentStats = useMemo(() => {
   if (!currentQ || !userHistory[currentQ.id]) return { attemptCount: 0, wrongCount: 0 };
   return {
     attemptCount: userHistory[currentQ.id].attemptCount || 0,
     wrongCount: userHistory[currentQ.id].wrongCount || 0
   };
 }, [currentQ, userHistory]);


 // カテゴリリスト
 const categories = useMemo(() => {
   const cats = allQuestions.map(q => q.category).filter(c => c && c.trim() !== '');
   return [...new Set(cats)].sort();
 }, [allQuestions]);


 // --- Auth & Init ---
 useEffect(() => {
   if (initError) return;
   const initAuth = async () => {
     if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
       await signInWithCustomToken(auth, __initial_auth_token);
     }
   };
   initAuth();
   const unsubscribe = onAuthStateChanged(auth, (u) => {
     setUser(u);
     setLoading(false);
     if (u) {
       setView('dashboard');
     } else {
       setView('auth');
     }
   });
   return () => unsubscribe();
 }, []);


 // ★ コース切り替え時やログイン時にデータをロード
 useEffect(() => {
   if (user && !initError) {
     loadUserData(user.uid, currentAppId);
   }
 }, [user, currentAppId]);


 // --- Data Loading ---
 const loadUserData = async (uid, targetAppId) => {
   if (initError) return;
   try {
     // データのクリア
     setAllQuestions([]);
     setQuestions([]);
    
     const qRef = collection(db, 'artifacts', targetAppId, 'public', 'data', 'questions');
     const qSnap = await getDocs(qRef);
     let loadedQuestions = [];
    
     if (qSnap.empty) {
       // Initial Seed
       const seedPromises = INITIAL_QUESTIONS.map(q =>
         setDoc(doc(db, 'artifacts', targetAppId, 'public', 'data', 'questions', q.id), q)
       );
       await Promise.all(seedPromises);
       loadedQuestions = INITIAL_QUESTIONS;
     } else {
       loadedQuestions = qSnap.docs.map(doc => ({...doc.data(), id: doc.id}));
     }
    
     // displayId (n_m) 順にソート
     loadedQuestions.sort((a, b) => {
       if (a.displayId && b.displayId) {
          const [aBatch, aNum] = a.displayId.split('_').map(Number);
          const [bBatch, bNum] = b.displayId.split('_').map(Number);
          if (aBatch !== bBatch) return (aBatch || 0) - (bBatch || 0);
          return (aNum || 0) - (bNum || 0);
       }
       return (a.createdAt || '').localeCompare(b.createdAt || '');
     });
    
     setAllQuestions(loadedQuestions);
     setQuestions(loadedQuestions);


     const historyRef = collection(db, 'artifacts', targetAppId, 'users', uid, 'history');
     const historySnap = await getDocs(historyRef);
     const historyData = {};
     historySnap.forEach(doc => historyData[doc.id] = doc.data());
     setUserHistory(historyData);
   } catch (error) {
     console.error("Error loading data:", error);
   }
 };


 // --- CSV Import ---
 const downloadTemplate = () => {
   const headers = "type,category,questionText,correctAnswer,option1,option2,option3,option4,option5,explanation";
   const example1 = 'single,循環器,"MRの聴診所見は？",全収縮期雑音,拡張期ランブル,収縮期駆出性雑音,全収縮期雑音,連続性雑音,拡張早期灌水様雑音,"解説文です"';
   const example2 = 'input,内分泌,"バセドウ病の抗体は？(4文字)",TRAb|TSH受容体抗体,,,,,,,"解説文です"';
   const csvContent = "\uFEFF" + [headers, example1, example2].join("\n");
   const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
   const url = URL.createObjectURL(blob);
   const link = document.createElement('a');
   link.href = url;
   link.setAttribute('download', 'question_template.csv');
   document.body.appendChild(link);
   link.click();
   document.body.removeChild(link);
 };


 const handleFileUpload = async (event) => {
   const file = event.target.files[0];
   if (!file) return;
   if (!uploadBatchNum || isNaN(parseInt(uploadBatchNum))) {
     alert("アップロード回数（バッチ番号）を入力してください");
     event.target.value = '';
     return;
   }


   const isDuplicateBatch = allQuestions.some(q => {
     if (!q.displayId) return false;
     const parts = q.displayId.split('_');
     return parts[0] === uploadBatchNum;
   });


   if (isDuplicateBatch) {
     alert(`エラー: 第${uploadBatchNum}回のデータは既に存在します。\n別の番号を指定するか、既存のデータを削除してからアップロードしてください。`);
     setImportStatus('エラー: バッチ番号重複');
     event.target.value = '';
     return;
   }


   const reader = new FileReader();
   reader.onload = async (e) => {
     try {
       setImportStatus('読み込み中...');
       const text = e.target.result;
       const lines = text.split(/\r\n|\n/).filter(line => line.trim() !== '');
      
       const startIdx = lines[0].startsWith('type') ? 1 : 0;
       const newQuestions = [];


       for (let i = startIdx; i < lines.length; i++) {
         const cols = parseCSVLine(lines[i]);
         if (cols.length < 4) continue;


         const [type, category, questionText, correctAnswerRaw, ...rest] = cols;
         const explanation = rest.pop() || '';
         const options = rest.filter(o => o && o.trim() !== '');


         let correctAnswer = correctAnswerRaw;
         if (type === 'multi') {
           correctAnswer = correctAnswerRaw.split('|').map(s => s.trim());
         }
        
         const displayId = `${uploadBatchNum}_${i - startIdx + 1}`;


         newQuestions.push({
           type: type.trim(),
           category: category.trim(),
           questionText: questionText.trim(),
           options: type === 'input' ? [] : options,
           correctAnswer,
           explanation: explanation.trim(),
           createdAt: new Date().toISOString(),
           displayId: displayId
         });
       }


       if (newQuestions.length === 0) {
         setImportStatus('データが見つかりません');
         return;
       }


       setImportStatus(`${newQuestions.length}件登録中...`);
       const chunkSize = 500;
       for (let i = 0; i < newQuestions.length; i += chunkSize) {
         const chunk = newQuestions.slice(i, i + chunkSize);
         const batch = writeBatch(db);
         chunk.forEach(q => {
           const docRef = doc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'questions'));
           batch.set(docRef, q);
         });
         await batch.commit();
       }


       setImportStatus(`完了！ ${newQuestions.length}件追加しました。(ID: ${uploadBatchNum}_1 〜)`);
       loadUserData(user.uid, currentAppId);
       setTimeout(() => setImportStatus(''), 3000);


     } catch (error) {
       console.error(error);
       setImportStatus('エラー: CSV形式を確認してください');
     }
   };
   reader.readAsText(file);
 };


 // --- Auth Handlers ---
 const handleAuth = async (e) => {
   e.preventDefault();
   setAuthError('');
   try {
     if (authMode === 'signup') {
       await createUserWithEmailAndPassword(auth, email, password);
     } else {
       await signInWithEmailAndPassword(auth, email, password);
     }
   } catch (error) {
     if (error.code === 'auth/operation-not-allowed' || error.message.includes('iframe')) {
         await signInAnonymously(auth);
     } else {
         setAuthError(error.message);
     }
   }
 };


 // --- Quiz Logic ---
 const startQuiz = (selectedMode) => {
   setMode(selectedMode);
   let targetQuestions = [...allQuestions];
  
   if (selectedMode === 'review') {
     targetQuestions = targetQuestions.filter(q => {
       const hist = userHistory[q.id];
       if (!hist) return false;
       return hist.isCorrect === false || hist.isUnsure === true;
     });


     targetQuestions.sort((a, b) => {
       const histA = userHistory[a.id];
       const histB = userHistory[b.id];
       const rateA = (histA.attemptCount > 0) ? (histA.wrongCount / histA.attemptCount) : 0;
       const rateB = (histB.attemptCount > 0) ? (histB.wrongCount / histB.attemptCount) : 0;
       if (Math.abs(rateA - rateB) > 0.0001) return rateB - rateA;
       return histB.wrongCount - histA.wrongCount;
     });


     if (targetQuestions.length === 0) {
       alert("復習する問題はありません！素晴らしい！");
       return;
     }
   } else {
     const notAnswered = targetQuestions.filter(q => !userHistory[q.id]);
     const answered = targetQuestions.filter(q => userHistory[q.id]);
    
     const shuffledNotAnswered = shuffleArray(notAnswered);
     const shuffledAnswered = shuffleArray(answered);
    
     targetQuestions = [...shuffledNotAnswered, ...shuffledAnswered];
   }


   setQuestions(targetQuestions);
   setCurrentQuestionIndex(0);
   resetQuestionState();
   setSessionStats({ correct: 0, total: targetQuestions.length });
   setView('quiz');
 };


 const startCustomQuiz = () => {
   if (!customBatch && !customCategory) {
     alert("回数またはカテゴリを指定してください");
     return;
   }


   let targets = [...allQuestions];


   if (customBatch) {
     targets = targets.filter(q => {
       if (!q.displayId) return false;
       const parts = q.displayId.split('_');
       return parts[0] === customBatch;
     });
   }


   if (customCategory) {
     targets = targets.filter(q => q.category === customCategory);
   }


   if (targets.length === 0) {
     alert("条件に一致する問題がありません");
     return;
   }


   const finalQuestions = shuffleArray(targets);
   setQuestions(finalQuestions);
   setCurrentQuestionIndex(0);
   resetQuestionState();
   setSessionStats({ correct: 0, total: finalQuestions.length });
   setMode('custom');
   setView('quiz');
 };


 const handleSearchQuiz = () => {
   if (!searchId) return;
   const target = allQuestions.find(q => q.displayId === searchId);
   if (!target) {
     alert(`問題ID「${searchId}」は見つかりませんでした。`);
     return;
   }
   setMode('search');
   setQuestions([target]);
   setCurrentQuestionIndex(0);
   resetQuestionState();
   setSessionStats({ correct: 0, total: 1 });
   setView('quiz');
 };


 const resetQuestionState = () => {
   setSelectedOptions([]);
   setTextInput('');
   setShowExplanation(false);
   setIsUnsure(false);
   setPrevAttempt(null); // ★ リセット
 };


 const handleOptionSelect = (option) => {
   if (showExplanation) return;
   if (currentQ.type === 'single') {
     setSelectedOptions([option]);
   } else if (currentQ.type === 'multi') {
     if (selectedOptions.includes(option)) {
       setSelectedOptions(selectedOptions.filter(o => o !== option));
     } else {
       setSelectedOptions([...selectedOptions, option]);
     }
   }
 };


 const checkAnswer = async () => {
   let isCorrect = false;


   if (currentQ.type === 'input') {
     const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
     const normalizedInput = normalizeString(textInput);
     const correctAnswers = currentQ.correctAnswer.split('|');
     isCorrect = correctAnswers.some(ans => normalizedInput === normalizeString(ans));
   } else if (currentQ.type === 'single') {
     isCorrect = isAnswerMatch(selectedOptions[0], normalizedCorrectAnswers[0]);
   } else if (currentQ.type === 'multi') {
     const correctArr = normalizedCorrectAnswers;
     if (selectedOptions.length === correctArr.length) {
       isCorrect = selectedOptions.every(opt =>
         correctArr.some(ans => isAnswerMatch(opt, ans))
       );
     } else {
       isCorrect = false;
     }
   }


   if (isCorrect) {
       setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));
   }


   if (user) {
     // ★ ここで更新前の履歴を退避
     const prevHistory = userHistory[currentQ.id] || {};
     setPrevAttempt(prevHistory.timestamp ? prevHistory : null);


     const currentWrongCount = prevHistory.wrongCount || 0;
     const currentAttemptCount = prevHistory.attemptCount || 0;


     const newWrongCount = isCorrect ? currentWrongCount : currentWrongCount + 1;
     const newAttemptCount = currentAttemptCount + 1;


     const resultData = {
       ...prevHistory,
       isCorrect,
       timestamp: new Date().toISOString(),
       lastAnswer: currentQ.type === 'input' ? textInput : selectedOptions,
       wrongCount: newWrongCount,
       attemptCount: newAttemptCount,
       isUnsure: false
     };
    
     setUserHistory(prev => ({ ...prev, [currentQ.id]: resultData }));
     await setDoc(doc(db, 'artifacts', currentAppId, 'users', user.uid, 'history', currentQ.id), resultData);
   }
   setShowExplanation(true);
 };


 const toggleUnsureMark = async () => {
   if (!user) return;
   const newUnsureStatus = !isUnsure;
   setIsUnsure(newUnsureStatus);


   const updatedHistory = {
     ...userHistory[currentQ.id],
     isUnsure: newUnsureStatus
   };
   setUserHistory(prev => ({ ...prev, [currentQ.id]: updatedHistory }));
  
   await updateDoc(doc(db, 'artifacts', currentAppId, 'users', user.uid, 'history', currentQ.id), {
     isUnsure: newUnsureStatus
   });
 };


 const nextQuestion = () => {
   if (currentQuestionIndex < questions.length - 1) {
     setCurrentQuestionIndex(prev => prev + 1);
     resetQuestionState();
   } else {
     setView('result');
   }
 };


 // --- Admin Logic ---
 const handleDeleteQuestion = async (id) => {
   if (!confirm("本当にこの問題を削除しますか？")) return;
   try {
     await deleteDoc(doc(db, 'artifacts', currentAppId, 'public', 'data', 'questions', id));
     const newAll = allQuestions.filter(q => q.id !== id);
     setAllQuestions(newAll);
     setQuestions(newAll);
   } catch (error) {
     alert("削除失敗: " + error.message);
   }
 };


 const handleDeleteAll = async () => {
   if (!confirm(`【警告】「${COURSES.find(c=>c.id===currentAppId).name}」の問題を全て削除しますか？`)) return;
   if (!confirm("本当に本当によろしいですか？")) return;
  
   try {
     setImportStatus("削除中...");
     const qRef = collection(db, 'artifacts', currentAppId, 'public', 'data', 'questions');
     const snapshot = await getDocs(qRef);
     const chunkSize = 500;
     const docs = snapshot.docs;
     for (let i = 0; i < docs.length; i += chunkSize) {
       const batch = writeBatch(db);
       docs.slice(i, i + chunkSize).forEach(doc => batch.delete(doc.ref));
       await batch.commit();
     }
     setAllQuestions([]);
     setQuestions([]);
     setImportStatus("全件削除完了");
     setTimeout(() => setImportStatus(''), 3000);
   } catch (error) {
     alert("削除エラー: " + error.message);
   }
 };


 const handleDeleteRange = async () => {
   const batchNumStr = deleteRange.batch;
   const s = parseInt(deleteRange.start);
   const e = parseInt(deleteRange.end);
   if (!batchNumStr || isNaN(s) || isNaN(e) || s > e || s < 1) {
     alert("有効な範囲を指定してください (例: バッチ3, 2〜50)");
     return;
   }
   if (!confirm(`ID ${batchNumStr}_${s} から ${batchNumStr}_${e} までの問題を削除しますか？`)) return;


   const targets = allQuestions.filter(q => {
     if (!q.displayId) return false;
     const parts = q.displayId.split('_');
     if (parts.length !== 2) return false;
     if (parts[0] !== batchNumStr) return false;
     const num = parseInt(parts[1]);
     return num >= s && num <= e;
   });


   if (targets.length === 0) {
     alert("指定された範囲に問題が見つかりませんでした");
     return;
   }


   try {
     setImportStatus(`${targets.length}件を削除中...`);
     const chunkSize = 500;
     for (let i = 0; i < targets.length; i += chunkSize) {
       const batch = writeBatch(db);
       targets.slice(i, i + chunkSize).forEach(q => {
         const ref = doc(db, 'artifacts', currentAppId, 'public', 'data', 'questions', q.id);
         batch.delete(ref);
       });
       await batch.commit();
     }
     const deletedIds = new Set(targets.map(q => q.id));
     const newAll = allQuestions.filter(q => !deletedIds.has(q.id));
     setAllQuestions(newAll);
     setQuestions(newAll);
     setImportStatus("削除完了");
     setDeleteRange({ batch: '', start: '', end: '' });
     setTimeout(() => setImportStatus(''), 3000);
   } catch (error) {
     alert("削除エラー: " + error.message);
   }
 };


 const handleCreateQuestion = async () => {
   if (!newQ.questionText || !newQ.category || !newQ.explanation) {
     alert('必須項目を入力してください'); return;
   }
   let finalCorrectAnswer;
   const cleanOptions = newQ.options.filter(o => o.trim() !== '');
   if (newQ.type === 'input') {
     if (!newQ.correctAnswerInput) { alert('正解を入力'); return; }
     finalCorrectAnswer = newQ.correctAnswerInput;
   } else {
     if (adminSelectedIndices.length === 0) { alert('正解を選択'); return; }
     if (newQ.type === 'single') finalCorrectAnswer = cleanOptions[adminSelectedIndices[0]];
     else finalCorrectAnswer = adminSelectedIndices.map(i => cleanOptions[i]);
   }


   const newQuestionData = {
     type: newQ.type,
     category: newQ.category,
     questionText: newQ.questionText,
     options: newQ.type === 'input' ? [] : cleanOptions,
     correctAnswer: finalCorrectAnswer,
     explanation: newQ.explanation,
     createdAt: new Date().toISOString(),
     displayId: "Manual"
   };


   try {
     const docRef = await addDoc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'questions'), newQuestionData);
     const added = { ...newQuestionData, id: docRef.id };
     setAllQuestions([...allQuestions, added]);
     setQuestions([...allQuestions, added]);
     alert('追加しました');
     setNewQ({ type: 'single', category: '', questionText: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: '' });
     setAdminSelectedIndices([]);
   } catch (e) { alert(e.message); }
 };


 // --- UI Rendering ---
  if (initError) {
   return (
     <div className="min-h-screen flex items-center justify-center bg-red-50 p-6">
       <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md text-center">
         <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
           <AlertCircle className="text-red-500 w-8 h-8" />
         </div>
         <h2 className="text-xl font-bold text-gray-800 mb-2">設定エラー</h2>
         <p className="text-gray-600 mb-4 break-all text-sm">{initError}</p>
         <p className="text-xs text-gray-400 bg-gray-100 p-2 rounded text-left">
           App.jsxの36行目付近にある「firebaseConfig」の設定を確認してください。
         </p>
       </div>
     </div>
   );
 }


 if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600 font-bold text-xl animate-pulse">Loading...</div>;


 if (view === 'auth') {
   return (
     <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
       <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md">
         <div className="text-center mb-8">
           <div className="bg-blue-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
             <Brain className="text-white w-10 h-10" />
           </div>
           <h1 className="text-2xl font-bold text-gray-800">MediPass</h1>
           <p className="text-gray-500 mt-2">国家試験対策学習アプリ</p>
         </div>
         <form onSubmit={handleAuth} className="space-y-4">
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">Email</label>
             <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@med.jp" />
           </div>
           <div>
             <label className="block text-sm font-bold text-gray-700 mb-1 ml-1">Password</label>
             <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
           </div>
           {authError && <div className="bg-red-50 text-red-500 p-3 rounded-lg text-sm flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5"/>{authError}</div>}
           <Button type="submit" className="w-full" size="large">{authMode === 'login' ? 'ログイン' : '新規登録'}</Button>
         </form>
         <div className="mt-8 text-center">
           <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-blue-600 font-bold hover:underline text-sm">
             {authMode === 'login' ? 'アカウントを作成する' : 'ログイン画面に戻る'}
           </button>
         </div>
       </div>
     </div>
   );
 }


 if (view === 'dashboard') {
   const wrongCount = Object.values(userHistory).filter(h => !h.isCorrect || h.isUnsure).length;
   const totalAnswered = Object.keys(userHistory).length;
  
   return (
     <div className="min-h-screen bg-gray-50 pb-32">
       <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-20 safe-area-top">
        
         {/* ★ 左上：コース切替プルダウン */}
         <div className="flex items-center gap-2">
           <GraduationCap className="text-blue-600 w-6 h-6" />
           <select
             value={currentAppId}
             onChange={(e) => setCurrentAppId(e.target.value)}
             className="text-lg font-bold text-gray-800 bg-transparent border-none outline-none cursor-pointer focus:ring-2 focus:ring-blue-200 rounded px-1"
           >
             {COURSES.map(course => (
               <option key={course.id} value={course.id}>{course.name}</option>
             ))}
           </select>
         </div>


         <button onClick={() => {signOut(auth); setView('auth');}} className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors">
           <LogOut size={24} />
         </button>
       </header>


       <main className="p-6 max-w-2xl mx-auto space-y-8">
         <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-8 text-white shadow-xl shadow-blue-200">
           <h2 className="text-lg font-bold opacity-90 mb-6 flex items-center gap-2">
             <Brain className="w-5 h-5"/> 学習状況 ({COURSES.find(c=>c.id===currentAppId).name})
           </h2>
           <div className="flex gap-12">
             <div>
               <p className="text-4xl font-extrabold mb-1">{totalAnswered}</p>
               <p className="text-sm opacity-75 font-medium">回答済み</p>
             </div>
             <div>
               <p className="text-4xl font-extrabold text-amber-300 mb-1">{wrongCount}</p>
               <p className="text-sm opacity-75 font-medium">要復習 (× / △)</p>
             </div>
           </div>
         </div>


         {/* ★ カスタム演習（条件指定） */}
         <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 space-y-4">
           <h3 className="font-bold text-gray-800 flex items-center gap-2">
             <Filter size={20} className="text-blue-500"/> 条件を指定して演習
           </h3>
          
           <div className="grid grid-cols-2 gap-3">
             <div>
               <label className="block text-xs font-bold text-gray-500 mb-1">回数 (No._前)</label>
               <Input
                 type="number"
                 placeholder="例: 3"
                 value={customBatch}
                 onChange={(e) => setCustomBatch(e.target.value)}
                 className="text-center"
               />
             </div>
             <div>
               <label className="block text-xs font-bold text-gray-500 mb-1">カテゴリ</label>
               <select
                 className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-base"
                 value={customCategory}
                 onChange={(e) => setCustomCategory(e.target.value)}
               >
                 <option value="">指定なし</option>
                 {categories.map(c => (
                   <option key={c} value={c}>{c}</option>
                 ))}
               </select>
             </div>
           </div>
          
           <Button onClick={startCustomQuiz} variant="outline" className="w-full border-blue-500 text-blue-600 hover:bg-blue-50">
             指定条件でランダム演習
           </Button>
         </div>


         {/* ID検索エリア */}
         <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center gap-2">
           <Input
             value={searchId}
             onChange={(e) => setSearchId(e.target.value)}
             placeholder="問題ID (例: 2_43)"
             className="text-sm py-2"
           />
           <Button onClick={handleSearchQuiz} variant="secondary" size="small" className="shrink-0">
             <Search size={18}/> 検索
           </Button>
         </div>


         <div className="grid gap-4">
           <button
             onClick={() => startQuiz('all')}
             className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all group active:scale-[0.98]"
           >
             <div className="flex items-center gap-5">
               <div className="bg-blue-100 p-4 rounded-xl text-blue-600">
                 <BookOpen size={28} />
               </div>
               <div className="text-left">
                 <h3 className="font-bold text-gray-800 text-lg">全問演習</h3>
                 <p className="text-sm text-gray-500 font-medium">未回答を優先して出題</p>
               </div>
             </div>
             <ChevronRight className="text-gray-300 group-hover:text-blue-600" size={24} />
           </button>


           <button
             onClick={() => startQuiz('review')}
             disabled={wrongCount === 0}
             className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center justify-between hover:border-amber-200 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
           >
             <div className="flex items-center gap-5">
               <div className="bg-amber-100 p-4 rounded-xl text-amber-600">
                 <RefreshCw size={28} />
               </div>
               <div className="text-left">
                 <h3 className="font-bold text-gray-800 text-lg">復習モード</h3>
                 <p className="text-sm text-gray-500 font-medium">誤答・不安な問題のみ出題</p>
               </div>
             </div>
             <ChevronRight className="text-gray-300 group-hover:text-amber-600" size={24} />
           </button>
         </div>


         {/* 管理者のみ表示 */}
         {user?.email === ADMIN_EMAIL && (
           <div className="pt-6 border-t border-gray-200">
              <button onClick={() => setView('admin')} className="w-full bg-gray-100 hover:bg-gray-200 text-gray-600 font-bold p-4 rounded-2xl flex items-center justify-center gap-2 transition-colors">
               <Plus size={20} /> 問題の追加・管理
             </button>
           </div>
         )}
       </main>
     </div>
   );
 }


 if (view === 'result') {
   const correctRate = Math.round((sessionStats.correct / sessionStats.total) * 100) || 0;
   return (
     <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
       <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-md text-center space-y-8">
         <div className="bg-blue-100 w-20 h-20 rounded-full flex items-center justify-center mx-auto">
           <Award className="text-blue-600 w-10 h-10" />
         </div>
        
         <div>
           <h2 className="text-2xl font-bold text-gray-800 mb-2">演習完了！</h2>
           <p className="text-gray-500">お疲れ様でした。今回の結果です。</p>
         </div>


         <div className="grid grid-cols-2 gap-4 bg-gray-50 p-6 rounded-2xl">
           <div>
             <p className="text-sm text-gray-500 font-bold mb-1">正解数</p>
             <p className="text-3xl font-bold text-gray-800">{sessionStats.correct} <span className="text-sm text-gray-400">/ {sessionStats.total}</span></p>
           </div>
           <div>
             <p className="text-sm text-gray-500 font-bold mb-1">正答率</p>
             <p className="text-3xl font-bold text-blue-600">{correctRate}%</p>
           </div>
         </div>


         <Button onClick={() => setView('dashboard')} size="large" className="w-full">
           <Home size={20} /> ダッシュボードへ戻る
         </Button>
       </div>
     </div>
   );
 }


 if (view === 'admin') {
   return (
     <div className="min-h-screen bg-gray-50">
       <header className="bg-white shadow-sm px-6 py-4 flex items-center sticky top-0 z-20 safe-area-top gap-4">
         <button onClick={() => setView('dashboard')} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full">
           <ArrowLeft size={24} />
         </button>
         {/* ★ ヘッダーにコース名表示 */}
         <div>
           <h1 className="text-xl font-bold text-gray-800">問題管理</h1>
           <p className="text-xs text-blue-600 font-bold">{COURSES.find(c=>c.id===currentAppId).name} コース編集中</p>
         </div>
       </header>


       <main className="p-6 max-w-2xl mx-auto pb-32 space-y-8">
        
         {/* CSV Import */}
         <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4 border border-blue-100">
           <h2 className="font-bold text-gray-800 flex items-center gap-2">
             <FileText className="text-blue-600" /> Excel/CSV一括登録
           </h2>
           <div className="space-y-3">
             <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
               <span className="text-xs font-bold text-blue-700 whitespace-nowrap">今回アップロード回数:</span>
               <Input
                 type="number"
                 value={uploadBatchNum}
                 onChange={(e) => setUploadBatchNum(e.target.value)}
                 className="w-20 py-1 px-2 text-center text-sm h-8"
                 placeholder="3"
               />
               <span className="text-xs text-blue-500">例: 3を入力→ 3_1, 3_2...</span>
             </div>


             <div className="flex gap-3">
               <Button onClick={downloadTemplate} variant="secondary" size="small" className="flex-1">
                 <Download size={16} /> 雛形DL
               </Button>
               <div className="relative flex-1">
                 <input type="file" accept=".csv" onChange={handleFileUpload} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
                 <Button variant="success" size="small" className="w-full">
                   <Upload size={16} /> CSV読込
                 </Button>
               </div>
             </div>
           </div>
           {importStatus && <p className="text-sm font-bold text-center text-blue-600">{importStatus}</p>}
         </div>


         {/* Delete Controls */}
         <div className="bg-white rounded-3xl shadow-sm p-6 space-y-6 border border-red-100">
           <h2 className="font-bold text-gray-800 flex items-center gap-2 text-red-600">
             <Trash2 className="text-red-600" /> 削除メニュー
           </h2>
          
           <div className="space-y-2">
             <p className="text-sm font-bold text-gray-600">ID範囲指定削除</p>
             <div className="flex gap-2 items-center">
               <div className="w-20 shrink-0">
                 <Input type="number" placeholder="回" value={deleteRange.batch} onChange={e=>setDeleteRange({...deleteRange, batch:e.target.value})} className="text-center"/>
               </div>
               <span className="text-gray-400 font-bold">の</span>
               <Input type="number" placeholder="開始No." value={deleteRange.start} onChange={e=>setDeleteRange({...deleteRange, start:e.target.value})} className="text-center"/>
               <span className="text-gray-400 font-bold">〜</span>
               <Input type="number" placeholder="終了No." value={deleteRange.end} onChange={e=>setDeleteRange({...deleteRange, end:e.target.value})} className="text-center"/>
             </div>
             <p className="text-xs text-gray-400 text-center">例: 「3」の「2」〜「50」→ ID 3_2 〜 3_50 を削除</p>
             <Button onClick={handleDeleteRange} variant="danger" size="small" className="w-full mt-2">
               指定範囲を削除
             </Button>
           </div>


           <div className="pt-4 border-t border-gray-100">
             <Button onClick={handleDeleteAll} variant="dangerSolid" className="w-full">
               <Trash2 size={20} /> 全ての問題を削除
             </Button>
           </div>
         </div>


         {/* Question List */}
         <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4">
            <h2 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-4">
             <List className="text-gray-600" /> 登録済み問題 ({questions.length})
           </h2>
           <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
             {questions.map((q, idx) => (
               <div key={q.id} className="flex items-start gap-3 p-4 border border-gray-100 rounded-2xl hover:bg-gray-50 transition-colors">
                 <div className="flex flex-col gap-1 shrink-0 mt-0.5">
                   <span className="bg-gray-200 text-gray-600 text-xs font-bold px-2 py-1 rounded-md text-center">
                     No.{idx + 1}
                   </span>
                   {/* ★ 管理用ID表示 */}
                   <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-1 py-0.5 rounded text-center border border-blue-100">
                     {q.displayId || '-'}
                   </span>
                 </div>
                 <div className="flex-1 min-w-0">
                   <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                     <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">{q.category}</span>
                     <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{q.type}</span>
                   </div>
                   <p className="text-sm font-bold text-gray-800 line-clamp-2 leading-relaxed">{q.questionText}</p>
                 </div>
                 <button onClick={() => handleDeleteQuestion(q.id)} className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all shrink-0">
                   <Trash2 size={18} />
                 </button>
               </div>
             ))}
             {questions.length === 0 && <p className="text-gray-400 text-center py-8">問題が登録されていません</p>}
           </div>
         </div>
       </main>
     </div>
   );
 }


 // 4. Quiz Screen (Safe Guard)
 if (!currentQ && view === 'quiz') {
   return (
     <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col gap-4">
       <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
       <p className="text-gray-500 font-bold">データを読み込んでいます...</p>
       <p className="text-xs text-gray-400">※ずっと動かない場合はAPIキーを確認してください</p>
     </div>
   );
 }


 // Quiz Rendering Logic
 let isCorrectDisplay = false;
 if (showExplanation && currentQ) {
   if (currentQ.type === 'input') {
     const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
     // 記述式の別解対応
     const normalizedInput = normalizeString(textInput);
     const correctAnswers = currentQ.correctAnswer.split('|');
     isCorrectDisplay = correctAnswers.some(ans => normalizedInput === normalizeString(ans));
    
   } else if (currentQ.type === 'single') {
     // ★ 修正: singleの場合も正規化済みの正解(テキスト)を使用
     isCorrectDisplay = isAnswerMatch(selectedOptions[0], normalizedCorrectAnswers[0]);
   } else if (currentQ.type === 'multi') {
     // ★ 修正: 数字指定にも対応した normalizedCorrectAnswers を使って判定
     const correctArr = normalizedCorrectAnswers;
    
     if (selectedOptions.length === correctArr.length) {
       isCorrectDisplay = selectedOptions.every(opt =>
         correctArr.some(ans => isAnswerMatch(opt, ans))
       );
     } else {
       isCorrectDisplay = false;
     }
   }
 }


 return (
   <div className="min-h-screen bg-gray-50 flex flex-col">
     <div className="bg-white px-4 py-4 shadow-sm flex justify-between items-center sticky top-0 z-20 safe-area-top">
       <button onClick={() => setView('dashboard')} className="text-gray-500 font-bold text-sm bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200">
         中断
       </button>
       <div className="font-bold text-gray-700 flex flex-col items-center leading-tight">
         {/* ★ ID表示と履歴スタッツの追加 */}
         <div className="flex items-center gap-2 mb-0.5">
            <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">No.{currentQ?.displayId || (currentQuestionIndex + 1)}</span>
         </div>
         <span className="text-lg">{currentQuestionIndex + 1} <span className="text-sm text-gray-400">/ {questions.length}</span></span>
        
         {/* ★ 履歴スタッツ表示エリア */}
         <div className="flex items-center gap-3 mt-1 text-xs text-gray-500 bg-blue-50 px-3 py-1 rounded-full border border-blue-100">
           <span className="flex items-center gap-1">
             <History size={12} className="text-blue-400"/> 挑戦: <span className="font-bold text-blue-600">{currentStats.attemptCount}</span>回
           </span>
           <span className="w-px h-3 bg-blue-200"></span>
           <span className="flex items-center gap-1">
             <XCircle size={12} className="text-red-400"/> 誤答: <span className="font-bold text-red-600">{currentStats.wrongCount}</span>回
           </span>
         </div>
       </div>
       <div className="w-12">
         {isReviewMode && <span className="text-[10px] bg-amber-100 text-amber-600 px-2 py-1 rounded-full font-bold">復習</span>}
       </div>
     </div>


     <div className="flex-1 overflow-y-auto p-4 pb-40 max-w-2xl mx-auto w-full">
       {currentQ && (
         <div className="bg-white rounded-3xl shadow-sm p-6 mb-6">
           <div className="flex items-center gap-2 mb-4">
             <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded-md">{currentQ.category}</span>
             <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded-md">
               {currentQ.type === 'multi' ? '複数選択' : currentQ.type === 'input' ? '記述' : '単一選択'}
             </span>
           </div>
           <h2 className="text-xl font-bold text-gray-900 leading-relaxed mb-8">{currentQ.questionText}</h2>


           <div className="space-y-3">
             {currentQ.type === 'input' ? (
               <div className="my-8">
                 <Input
                   value={textInput}
                   onChange={(e) => setTextInput(e.target.value)}
                   placeholder="解答を入力してください"
                   onKeyDown={(e) => e.key === 'Enter' && !showExplanation && checkAnswer()}
                   disabled={showExplanation}
                   autoFocus
                 />
               </div>
             ) : (
               currentOptions.map((option, idx) => {
                 const isSelected = selectedOptions.includes(option);
                 let styleClass = "border-2 border-gray-100 hover:bg-gray-50 hover:border-gray-200";
                
                 if (showExplanation) {
                   const correctArr = normalizedCorrectAnswers;
                   const isAnswer = correctArr.some(ans => isAnswerMatch(option, ans));


                   if (isAnswer) styleClass = "bg-emerald-50 border-emerald-500 text-emerald-700 font-bold";
                   else if (isSelected && !isAnswer) styleClass = "bg-red-50 border-red-200 text-red-400";
                   else styleClass = "opacity-40 border-gray-100 grayscale";
                 } else {
                   if (isSelected) styleClass = "bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-sm ring-1 ring-blue-500";
                 }


                 return (
                   <button key={idx} onClick={() => handleOptionSelect(option)} disabled={showExplanation}
                     className={`w-full text-left p-4 rounded-xl transition-all duration-200 flex items-center justify-between text-base leading-snug ${styleClass} active:scale-[0.99]`}
                   >
                     <span>{option}</span>
                     {isSelected && !showExplanation && <CheckCircle size={20} className="text-blue-600 fill-blue-50"/>}
                     {showExplanation && (
                       /* ★ 柔軟な判定を使ってアイコン表示 */
                       (normalizedCorrectAnswers.some(ans => isAnswerMatch(option, ans)))
                       ? <CheckCircle size={20} className="text-emerald-600 fill-emerald-100"/>
                       : (isSelected && <XCircle size={20} className="text-red-400 fill-red-50"/>)
                     )}
                   </button>
                 );
               })
             )}
           </div>
         </div>
       )}


       {showExplanation && currentQ && (
         <div className={`rounded-3xl p-6 shadow-sm border-l-8 animate-in fade-in slide-in-from-bottom-4 duration-500 ${isCorrectDisplay ? 'bg-emerald-50 border-emerald-500' : 'bg-red-50 border-red-500'}`}>
           <div className="flex items-center justify-between mb-4">
             <div className="flex items-center gap-3">
               {isCorrectDisplay ? (
                 <CheckCircle className="text-emerald-600 w-8 h-8 fill-white" />
               ) : (
                 <XCircle className="text-red-500 w-8 h-8 fill-white" />
               )}
               <span className={`text-2xl font-bold ${isCorrectDisplay ? 'text-emerald-800' : 'text-red-800'}`}>
                 {isCorrectDisplay ? '正解！' : '不正解...'}
               </span>
             </div>
            
             {isCorrectDisplay && (
               <button
                 onClick={toggleUnsureMark}
                 className={`flex items-center gap-1 px-3 py-2 rounded-lg text-sm font-bold transition-colors ${
                   isUnsure
                   ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-400'
                   : 'bg-white text-gray-400 border border-gray-200 hover:bg-gray-50'
                 }`}
               >
                 <AlertTriangle size={16} className={isUnsure ? "fill-amber-700" : ""} />
                 {isUnsure ? "復習リスト済" : "不安(復習へ)"}
               </button>
             )}
           </div>
          
           {/* ★★★ 追加：あなたの解答（今回） ★★★ */}
           <div className="bg-white/60 rounded-xl p-4 mb-2">
             <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">今回の解答</p>
             <p className={`text-lg font-bold break-words ${isCorrectDisplay ? 'text-emerald-700' : 'text-red-600'}`}>
               {currentQ.type === 'input'
                 ? (textInput || '(未入力)')
                 : (selectedOptions.length > 0 ? selectedOptions.join(', ') : '(未選択)')
               }
             </p>
           </div>


           {/* ★★★ 追加：前回の解答 ★★★ */}
           {prevAttempt && (
             <div className="bg-gray-100/80 rounded-xl p-4 mb-2 border border-gray-200">
               <div className="flex items-center gap-2 mb-1">
                 <History size={14} className="text-gray-500"/>
                 <p className="text-xs font-bold text-gray-500 uppercase tracking-wide">前回の結果</p>
               </div>
               <div className="flex items-center justify-between">
                  <p className="text-sm font-bold text-gray-700 break-words">
                    {Array.isArray(prevAttempt.lastAnswer)
                      ? prevAttempt.lastAnswer.join(', ')
                      : (prevAttempt.lastAnswer || '(記録なし)')}
                  </p>
                  <span className={`text-xs font-bold px-2 py-1 rounded ${prevAttempt.isCorrect ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-600'}`}>
                    {prevAttempt.isCorrect ? '正解' : '不正解'}
                  </span>
               </div>
               <p className="text-[10px] text-gray-400 mt-1 text-right">
                 {new Date(prevAttempt.timestamp).toLocaleDateString()}
               </p>
             </div>
           )}
          
           <div className="bg-white/60 rounded-xl p-4 mb-4">
             <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">正解</p>
             <p className="text-lg font-bold text-gray-900 break-words">
               {/* inputなら / 区切り、それ以外は , 区切りで見やすく表示 (normalizedを使用) */}
               {currentQ.type === 'input'
                 ? currentQ.correctAnswer.split('|').join(' / ')
                 : normalizedCorrectAnswers.join(', ')}
             </p>
           </div>


           <div className="pt-2">
             <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">解説</p>
             <p className="text-gray-800 leading-relaxed text-sm whitespace-pre-wrap">
               {currentQ.explanation}
             </p>
           </div>
         </div>
       )}
     </div>


     <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-20 safe-area-bottom shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
       <div className="max-w-2xl mx-auto">
         {!showExplanation ? (
           <Button onClick={checkAnswer} className="w-full" size="large" disabled={!canCheck}>
             解答する
           </Button>
         ) : (
           <Button
             onClick={nextQuestion}
             className="w-full"
             size="large"
             variant={isLastQuestion ? "secondary" : "primary"}
           >
             {isLastQuestion ? '学習を終了して結果を見る' : '次の問題へ'}
           </Button>
         )}
       </div>
     </div>
   </div>
 );
}

