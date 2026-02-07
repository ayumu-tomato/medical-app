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
  GraduationCap,
  Image as ImageIcon,
  Maximize2,
  X,
  PieChart,
  BarChart2,
  FileText as CaseIcon,
  Minus,
  Link as LinkIcon
} from 'lucide-react';

// --- Configuration ---
const ADMIN_EMAIL = "2004ayumu0417@gmail.com"; // 管理者メールアドレス

// コース定義
const COURSES = [
  { id: 'med-study-app', name: '試験対策' },
  { id: 'cbt-basic-app', name: 'CBT対策_基礎' },
  { id: 'cbt-clinical-app', name: 'CBT対策_臨床' },
  { id: 'qa-basic-app', name: 'QA_基礎' },
  { id: 'qa-clinical-app', name: 'QA_臨床' },
];

// --- Firebase Configuration (設定エリア) ---

const firebaseConfig = {
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
     console.warn("APIキーが正しく設定されていない可能性があります。");
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

// --- Helper: Google Drive Link Converter ---
const convertToDirectLink = (url) => {
  if (!url) return '';
  if (url.includes('drive.google.com') || url.includes('docs.google.com')) {
    let id = null;
    const parts = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (parts && parts[1]) {
      id = parts[1];
    } else {
      const idMatch = url.match(/id=([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) {
        id = idMatch[1];
      }
    }
    if (id) {
      return `https://drive.google.com/thumbnail?id=${id}&sz=w1000`;
    }
  }
  return url;
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

// --- Helper: Group and Shuffle Logic (For Linked Questions) ---
const groupAndShuffleQuestions = (questions) => {
  const groups = {};
  const singles = [];

  questions.forEach(q => {
    // typeが 'series' でかつ ID形式: XXXXXXXXXX_N (10桁_番号) がある場合のみグループ化
    const isSeries = q.type === 'series';
    const match = q.customId ? q.customId.match(/^(\d{10})_(\d+)$/) : null;
    
    if (isSeries && match) {
      const groupId = match[1]; // 2334412679
      const order = parseInt(match[2], 10); // 1
      
      if (!groups[groupId]) {
        groups[groupId] = [];
      }
      groups[groupId].push({ ...q, _order: order });
    } else {
      // それ以外は単独扱い
      singles.push(q);
    }
  });

  // 連問グループ内のソート (1 -> 2 -> 3)
  Object.values(groups).forEach(group => {
    group.sort((a, b) => a._order - b._order);
  });

  // 単独問題を1つのグループとして扱う
  const mixedGroups = [
    ...Object.values(groups), // 連問グループの配列
    ...singles.map(q => [q])  // 単独問題をそれぞれ配列に入れたもの
  ];

  // グループ単位でシャッフル
  const shuffledGroups = shuffleArray(mixedGroups);

  // フラットな配列に戻す
  return shuffledGroups.flat();
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
    customId: '',
    type: 'single',
    category: 'サンプル',
    questionText: 'これはサンプル問題です。選択肢1が正解です。',
    imageUrl: '', 
    options: ['選択肢1', '選択肢2', '選択肢3', '選択肢4', '選択肢5'],
    correctAnswer: '選択肢1',
    explanation: 'これはサンプル解説です。管理画面からCSVをインポートしてください。',
    caseText: '',
    caseImageUrl: '' // 新フィールド
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
  const [allQuestions, setAllQuestions] = useState([]);
  const [questions, setQuestions] = useState([]);
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
  
  const [currentAppId, setCurrentAppId] = useState(() => {
    const saved = localStorage.getItem('med-app-course-id');
    if (saved && COURSES.some(c => c.id === saved)) {
      return saved;
    }
    return COURSES[0].id;
  });

  useEffect(() => {
    localStorage.setItem('med-app-course-id', currentAppId);
  }, [currentAppId]);

  const [isUnsure, setIsUnsure] = useState(false);
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 }); 
  const [prevAttempt, setPrevAttempt] = useState(null); 
  const [imageModalUrl, setImageModalUrl] = useState(null);

  const [customBatch, setCustomBatch] = useState('');
  const [customCategory, setCustomCategory] = useState('');
  const [searchId, setSearchId] = useState('');
  const [statsTab, setStatsTab] = useState('progress');

  // Admin State
  const [newQ, setNewQ] = useState({
    customId: '', type: 'single', category: '', questionText: '', imageUrl: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: '', caseText: '', caseImageUrl: ''
  });
  const [adminSelectedIndices, setAdminSelectedIndices] = useState([]);
  const [deleteRange, setDeleteRange] = useState({ batch: '', start: '', end: '' });
  const [uploadBatchNum, setUploadBatchNum] = useState('1');

  const currentQ = questions[currentQuestionIndex];
  const isLastQuestion = questions.length > 0 && currentQuestionIndex === questions.length - 1;
  const isReviewMode = mode === 'review' || mode === 'custom-review';
  
  const getCurrentType = () => {
    if (!currentQ) return 'single';
    const rawType = currentQ.type || 'single';
    return rawType.toLowerCase().trim();
  };
  
  const canCheck = useMemo(() => {
    if (!currentQ) return false;
    const type = getCurrentType();
    if (type.includes('input')) {
      return textInput && textInput.trim().length > 0;
    }
    return selectedOptions && selectedOptions.length > 0;
  }, [currentQ, textInput, selectedOptions]);

  const currentOptions = useMemo(() => {
    const type = getCurrentType();
    if (!currentQ || !Array.isArray(currentQ.options) || type.includes('input')) {
      return [];
    }
    // single, multi, hyper はシャッフル
    return shuffleArray(currentQ.options);
  }, [currentQ]);

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

  const currentStats = useMemo(() => {
    if (!currentQ || !userHistory[currentQ.id]) return { attemptCount: 0, wrongCount: 0 };
    return {
      attemptCount: userHistory[currentQ.id].attemptCount || 0,
      wrongCount: userHistory[currentQ.id].wrongCount || 0
    };
  }, [currentQ, userHistory]);

  const categories = useMemo(() => {
    const cats = allQuestions.map(q => q.category).filter(c => c && c.trim() !== '');
    return [...new Set(cats)].sort();
  }, [allQuestions]);

  const categoryStats = useMemo(() => {
    if (allQuestions.length === 0) return [];
    const stats = {};
    allQuestions.forEach(q => {
      const cat = q.category || '未分類';
      if (!stats[cat]) {
        stats[cat] = { total: 0, answered: 0, correct: 0 };
      }
      stats[cat].total += 1;
      const hist = userHistory[q.id];
      if (hist && hist.attemptCount > 0) {
        stats[cat].answered += 1;
        if (hist.isCorrect) {
          stats[cat].correct += 1;
        }
      }
    });
    return Object.entries(stats).map(([name, data]) => ({
      name,
      ...data,
      progressRate: data.total > 0 ? Math.round((data.answered / data.total) * 100) : 0,
      accuracyRate: data.answered > 0 ? Math.round((data.correct / data.answered) * 100) : 0
    })).sort((a, b) => a.name.localeCompare(b.name));
  }, [allQuestions, userHistory]);

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

  useEffect(() => {
    if (user && !initError) {
      loadUserData(user.uid, currentAppId);
    }
  }, [user, currentAppId]);

  const loadUserData = async (uid, targetAppId) => {
    if (initError) return;
    try {
      setAllQuestions([]);
      setQuestions([]);
      const qRef = collection(db, 'artifacts', targetAppId, 'public', 'data', 'questions');
      const qSnap = await getDocs(qRef);
      let loadedQuestions = [];
      if (qSnap.empty) {
        const seedPromises = INITIAL_QUESTIONS.map(q => 
          setDoc(doc(db, 'artifacts', targetAppId, 'public', 'data', 'questions', q.id), q)
        );
        await Promise.all(seedPromises);
        loadedQuestions = INITIAL_QUESTIONS;
      } else {
        loadedQuestions = qSnap.docs.map(doc => ({...doc.data(), id: doc.id}));
      }
      
      // デフォルトソート
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

  const downloadTemplate = () => {
    // テンプレート (series/hyper用) - caseImageUrlを追加
    const headers = "id,type,category,questionText,correctAnswer,imageUrl,caseText,caseImageUrl,explanation,option1,option2,option3,option4,option5";
    const example1 = '2334412679_1,series,循環器,"連問の例",QT延長,"(問題画像)","79歳の男性...","(症例画像)","解説文",QT延長,洞性徐脈,心房細動,房室接合部調律,II度房室ブロック';
    // テンプレート (single/multi/input用)
    const example2 = ',single,一般,"通常問題",正解,,,,"",解説文,選択肢1,選択肢2,選択肢3,選択肢4,選択肢5';
    const csvContent = "\uFEFF" + [headers, example1, example2].join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'question_template_v6.csv');
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
        
        // ヘッダー行を解析 (series/hyper用)
        const headers = lines[0].split(',').map(h => h.trim());
        const idx = {
          id: headers.indexOf('id'),
          type: headers.indexOf('type'),
          category: headers.indexOf('category'),
          q: headers.indexOf('questionText'),
          ans: headers.indexOf('correctAnswer'),
          img: headers.indexOf('imageUrl'),
          case: headers.indexOf('caseText'),
          caseImg: headers.indexOf('caseImageUrl'), // 追加
          exp: headers.indexOf('explanation')
        };

        const startIdx = 1;
        const newQuestions = [];

        for (let i = startIdx; i < lines.length; i++) {
          const cols = parseCSVLine(lines[i]);
          if (cols.length < 4) continue;

          let type = idx.type > -1 ? cols[idx.type] : cols[0];
          type = (type || 'single').trim();

          let customId = '';
          let category = '';
          let questionText = '';
          let correctAnswer = '';
          let imageUrl = '';
          let caseText = '';
          let caseImageUrl = '';
          let explanation = '';
          let options = [];

          if (type === 'series' || type === 'hyper') {
             // ★ 新形式 (series / hyper)
             // ヘッダー依存
             if (idx.type > -1) {
               customId = idx.id > -1 ? cols[idx.id] : '';
               category = idx.category > -1 ? cols[idx.category] : '';
               questionText = idx.q > -1 ? cols[idx.q] : '';
               correctAnswer = idx.ans > -1 ? cols[idx.ans] : '';
               imageUrl = idx.img > -1 ? cols[idx.img] : '';
               caseText = idx.case > -1 ? cols[idx.case] : '';
               caseImageUrl = idx.caseImg > -1 ? cols[idx.caseImg] : '';
               explanation = idx.exp > -1 ? cols[idx.exp] : '';
               
               // オプション収集
               headers.forEach((h, colIndex) => {
                 if (h.startsWith('option') && cols[colIndex]) {
                   options.push(cols[colIndex]);
                 }
               });
             } else {
               // ヘッダーなしデフォルト順 (id, type, cat, q, ans, img, case, caseImg, exp, opts...)
               [customId, , category, questionText, correctAnswer, imageUrl, caseText, caseImageUrl, explanation, ...options] = cols;
             }

          } else {
             // ★ 旧形式 (single / multi / input)
             // 厳密な列固定: 0:type, 1:category, 2:q, 3:ans, 4:img, 5~9:options, 10:exp
             
             type = cols[0];
             category = cols[1] || '';
             questionText = cols[2] || '';
             correctAnswer = cols[3] || '';
             imageUrl = cols[4] || '';
             
             // options (5-9) 固定5個
             if (!type.includes('input')) {
               for (let k = 5; k <= 9; k++) {
                 if (cols[k]) options.push(cols[k]);
               }
             } else {
               options = [];
             }
             
             explanation = cols[10] || '';
             caseText = ''; // 存在しない
             caseImageUrl = ''; // 存在しない
             customId = ''; // 存在しない
          }
          
          // クリーニング
          options = options.filter(o => o && o.trim() !== '');
          if (type && (type.includes('multi') || type === 'hyper')) {
             if (correctAnswer.includes('|')) {
               correctAnswer = correctAnswer.split('|').map(s => s.trim());
             } else {
               correctAnswer = [correctAnswer.trim()];
             }
          }
          
          const displayId = `${uploadBatchNum}_${i}`; 

          newQuestions.push({
            customId: customId ? customId.trim() : '', 
            type: type,
            category: category ? category.trim() : '',
            questionText: questionText ? questionText.trim() : '',
            imageUrl: imageUrl ? imageUrl.trim() : '', 
            options: (type && type.includes('input')) ? [] : options,
            correctAnswer,
            explanation: explanation ? explanation.trim() : '',
            caseText: caseText ? caseText.trim() : '', 
            caseImageUrl: caseImageUrl ? caseImageUrl.trim() : '',
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
    } else {
      const notAnswered = targetQuestions.filter(q => !userHistory[q.id]);
      const answered = targetQuestions.filter(q => userHistory[q.id]);
      
      const shuffledNotAnswered = groupAndShuffleQuestions(notAnswered);
      const shuffledAnswered = groupAndShuffleQuestions(answered);
      
      targetQuestions = [...shuffledNotAnswered, ...shuffledAnswered];
    }

    if (targetQuestions.length === 0) {
      alert("問題がありません！");
      return;
    }

    setQuestions(targetQuestions);
    setCurrentQuestionIndex(0);
    resetQuestionState();
    setSessionStats({ correct: 0, total: targetQuestions.length });
    setView('quiz');
  };

  const startCustomQuiz = (isReview = false) => {
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
    
    if (isReview) {
        targets = targets.filter(q => {
            const hist = userHistory[q.id];
            if (!hist) return false; 
            return hist.isCorrect === false || hist.isUnsure === true;
        });
        targets.sort((a, b) => (userHistory[b.id]?.wrongCount || 0) - (userHistory[a.id]?.wrongCount || 0));
    } else {
        targets = groupAndShuffleQuestions(targets);
    }
    
    if (targets.length === 0) {
      alert("条件に一致する問題がありません");
      return;
    }
    setQuestions(targets);
    setCurrentQuestionIndex(0);
    resetQuestionState();
    setSessionStats({ correct: 0, total: targets.length }); 
    setMode(isReview ? 'custom-review' : 'custom'); 
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
    setPrevAttempt(null);
    setImageModalUrl(null);
  };

  const handleOptionSelect = (option) => {
    if (showExplanation) return;
    const type = getCurrentType();
    if (type.includes('multi') || type === 'hyper') {
      if (selectedOptions.includes(option)) {
        setSelectedOptions(selectedOptions.filter(o => o !== option));
      } else {
        setSelectedOptions([...selectedOptions, option]);
      }
    } else {
      setSelectedOptions([option]);
    }
  };

  const checkAnswer = async () => {
    let isCorrect = false;
    const type = getCurrentType();
    if (type.includes('input')) {
      const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
      const normalizedInput = normalizeString(textInput);
      const correctAnswers = currentQ.correctAnswer.split('|');
      isCorrect = correctAnswers.some(ans => normalizedInput === normalizeString(ans));
    } else if (type.includes('multi') || type === 'hyper') {
      const correctArr = normalizedCorrectAnswers;
      if (selectedOptions.length === correctArr.length) {
        isCorrect = selectedOptions.every(opt => 
          correctArr.some(ans => isAnswerMatch(opt, ans))
        );
      } else {
        isCorrect = false;
      }
    } else {
      isCorrect = isAnswerMatch(selectedOptions[0], normalizedCorrectAnswers[0]);
    }
    if (isCorrect) {
        setSessionStats(prev => ({ ...prev, correct: prev.correct + 1 }));
    }
    if (user) {
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
        lastAnswer: type.includes('input') ? textInput : selectedOptions,
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
      if (newQ.type === 'single' || newQ.type === 'series') finalCorrectAnswer = cleanOptions[adminSelectedIndices[0]];
      else finalCorrectAnswer = adminSelectedIndices.map(i => cleanOptions[i]);
    }
    const newQuestionData = {
      customId: newQ.customId || '', 
      type: newQ.type,
      category: newQ.category,
      questionText: newQ.questionText,
      imageUrl: newQ.imageUrl || '',
      options: newQ.type === 'input' ? [] : cleanOptions,
      correctAnswer: finalCorrectAnswer,
      explanation: newQ.explanation,
      caseText: newQ.caseText || '', 
      caseImageUrl: newQ.caseImageUrl || '',
      createdAt: new Date().toISOString(),
      displayId: "Manual" 
    };
    try {
      const docRef = await addDoc(collection(db, 'artifacts', currentAppId, 'public', 'data', 'questions'), newQuestionData);
      const added = { ...newQuestionData, id: docRef.id };
      setAllQuestions([...allQuestions, added]);
      setQuestions([...allQuestions, added]);
      alert('追加しました');
      setNewQ({ customId: '', type: 'single', category: '', questionText: '', imageUrl: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: '', caseText: '', caseImageUrl: '' });
      setAdminSelectedIndices([]);
    } catch (e) { alert(e.message); }
  };

  const handleAddOption = () => {
    setNewQ({ ...newQ, options: [...newQ.options, ''] });
  };

  const handleRemoveOption = (index) => {
    if (newQ.options.length <= 2) return; 
    const newOpts = newQ.options.filter((_, i) => i !== index);
    setNewQ({ ...newQ, options: newOpts });
    const newIndices = adminSelectedIndices
      .filter(i => i !== index)
      .map(i => (i > index ? i - 1 : i));
    setAdminSelectedIndices(newIndices);
  };

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
    const validQuestionIds = new Set(allQuestions.map(q => q.id));
    const validHistory = Object.entries(userHistory)
      .filter(([id, _]) => validQuestionIds.has(id))
      .map(([_, h]) => h);
    const wrongCount = validHistory.filter(h => !h.isCorrect || h.isUnsure).length;
    const totalAnswered = validHistory.length;
    
    return (
      <div className="min-h-screen bg-gray-50 pb-32">
        <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-20 safe-area-top">
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
            <div className="mt-6">
              <Button onClick={() => setView('stats')} variant="outline" className="w-full border-white/30 text-white hover:bg-white/10 bg-white/10">
                <BarChart2 size={18} /> 詳細な学習状況を確認
              </Button>
            </div>
          </div>
          <div className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 space-y-4">
            <h3 className="font-bold text-gray-800 flex items-center gap-2">
              <Filter size={20} className="text-blue-500"/> 条件を指定して演習
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">回数 (No._前)</label>
                <Input type="number" placeholder="例: 3" value={customBatch} onChange={(e) => setCustomBatch(e.target.value)} className="text-center" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1">カテゴリ</label>
                <select className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none bg-gray-50 text-base" value={customCategory} onChange={(e) => setCustomCategory(e.target.value)}>
                  <option value="">指定なし</option>
                  {categories.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => startCustomQuiz(false)} variant="outline" className="flex-1 border-blue-500 text-blue-600 hover:bg-blue-50 text-sm">
                ランダム演習
              </Button>
              <Button onClick={() => startCustomQuiz(true)} variant="warning" className="flex-1 text-sm bg-amber-500 text-white hover:bg-amber-600 border-none shadow-amber-200">
                復習
              </Button>
            </div>
          </div>
          <div className="bg-white p-4 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center gap-2">
            <Input value={searchId} onChange={(e) => setSearchId(e.target.value)} placeholder="問題ID (例: 2_43)" className="text-sm py-2" />
            <Button onClick={handleSearchQuiz} variant="secondary" size="small" className="shrink-0">
              <Search size={18}/> 検索
            </Button>
          </div>
          <div className="grid gap-4">
            <button onClick={() => startQuiz('all')} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center justify-between hover:border-blue-200 hover:shadow-md transition-all group active:scale-[0.98]">
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
            <button onClick={() => startQuiz('review')} disabled={wrongCount === 0} className="bg-white p-6 rounded-2xl shadow-sm border-2 border-gray-100 flex items-center justify-between hover:border-amber-200 hover:shadow-md transition-all group disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]">
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

  if (view === 'stats') {
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center sticky top-0 z-20 safe-area-top gap-4">
          <button onClick={() => setView('dashboard')} className="p-2 -ml-2 text-gray-500 hover:bg-gray-100 rounded-full">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold text-gray-800">詳細な学習状況</h1>
        </header>
        <main className="p-6 max-w-2xl mx-auto space-y-6">
          <div className="flex bg-gray-200 p-1 rounded-xl">
            <button onClick={() => setStatsTab('progress')} className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all ${statsTab === 'progress' ? 'bg-white text-blue-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>演習割合</button>
            <button onClick={() => setStatsTab('accuracy')} className={`flex-1 py-2 px-4 rounded-lg font-bold text-sm transition-all ${statsTab === 'accuracy' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>正答率</button>
          </div>
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            {categoryStats.length === 0 ? (
              <div className="p-8 text-center text-gray-400">データがありません</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {categoryStats.map((stat) => (
                  <div key={stat.name} className="p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex justify-between items-end mb-2">
                      <h3 className="font-bold text-gray-800">{stat.name}</h3>
                      <div className="text-right">
                        {statsTab === 'progress' ? (
                          <>
                            <span className="text-xl font-bold text-blue-600">{stat.progressRate}%</span>
                            <span className="text-xs text-gray-400 ml-1">({stat.answered}/{stat.total})</span>
                          </>
                        ) : (
                          <>
                            <span className="text-xl font-bold text-emerald-600">{stat.accuracyRate}%</span>
                            <span className="text-xs text-gray-400 ml-1">({stat.correct}/{stat.answered})</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${statsTab === 'progress' ? 'bg-blue-500' : 'bg-emerald-500'}`} style={{ width: `${statsTab === 'progress' ? stat.progressRate : stat.accuracyRate}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
          <div>
            <h1 className="text-xl font-bold text-gray-800">問題管理</h1>
            <p className="text-xs text-blue-600 font-bold">{COURSES.find(c=>c.id===currentAppId).name} コース編集中</p>
          </div>
        </header>
        <main className="p-6 max-w-2xl mx-auto pb-32 space-y-8">
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4 border border-green-100">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <Plus className="text-green-600" /> 手動で問題を追加
            </h2>
            <div className="space-y-4">
               <div className="grid grid-cols-2 gap-4">
                 <select value={newQ.type} onChange={(e) => setNewQ({...newQ, type: e.target.value})} className="w-full px-4 py-2 rounded-xl border-2 border-gray-100 focus:ring-2 focus:ring-green-500 outline-none bg-gray-50">
                   <option value="single">単一選択</option>
                   <option value="multi">複数選択</option>
                   <option value="input">記述式</option>
                   <option value="series">連問 (Series)</option>
                   <option value="hyper">多選択肢 (Hyper)</option>
                 </select>
                 <Input value={newQ.category} onChange={(e) => setNewQ({...newQ, category: e.target.value})} placeholder="カテゴリ (例: 循環器)" />
               </div>
               
               {newQ.type === 'series' && (
                 <div className="flex items-center gap-2 bg-gray-100 p-2 rounded-xl">
                   <LinkIcon size={16} className="text-gray-500"/>
                   <Input 
                     value={newQ.customId} 
                     onChange={(e) => setNewQ({...newQ, customId: e.target.value})} 
                     placeholder="問題ID (連問用: 1234567890_1 など)" 
                     className="text-sm"
                   />
                 </div>
               )}

               {newQ.type === 'series' && (
                 <>
                   <textarea value={newQ.caseText} onChange={(e) => setNewQ({...newQ, caseText: e.target.value})} placeholder="症例本文 (長文がある場合に入力)..." className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-green-500 outline-none h-24 resize-none bg-gray-50" />
                   <Input value={newQ.caseImageUrl} onChange={(e) => setNewQ({...newQ, caseImageUrl: e.target.value})} placeholder="症例画像URL (Google Drive共有リンク可)" />
                 </>
               )}

               <textarea value={newQ.questionText} onChange={(e) => setNewQ({...newQ, questionText: e.target.value})} placeholder="問題文を入力..." className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-green-500 outline-none h-24 resize-none bg-gray-50" />
               <Input value={newQ.imageUrl} onChange={(e) => setNewQ({...newQ, imageUrl: e.target.value})} placeholder="画像URL (Google Drive共有リンク可)" />
               
               {newQ.type === 'input' ? (
                 <Input value={newQ.correctAnswerInput} onChange={(e) => setNewQ({...newQ, correctAnswerInput: e.target.value})} placeholder="正解 (複数の場合は | で区切る)" />
               ) : (
                 <div className="space-y-2">
                   <label className="block text-xs font-bold text-gray-500 ml-1 mb-1">選択肢 (チェックで正解指定)</label>
                   {newQ.options.map((opt, idx) => (
                     <div key={idx} className="flex gap-2 items-center">
                       <input type="checkbox" checked={adminSelectedIndices.includes(idx)} onChange={() => { if (newQ.type === 'single' || newQ.type === 'series') setAdminSelectedIndices([idx]); else { if (adminSelectedIndices.includes(idx)) setAdminSelectedIndices(adminSelectedIndices.filter(i => i !== idx)); else setAdminSelectedIndices([...adminSelectedIndices, idx]); } }} className="w-5 h-5 accent-green-600 shrink-0" />
                       <Input value={opt} onChange={(e) => { const newOpts = [...newQ.options]; newOpts[idx] = e.target.value; setNewQ({...newQ, options: newOpts}); }} placeholder={`選択肢 ${idx + 1}`} />
                       <button onClick={() => handleRemoveOption(idx)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-100 hover:bg-red-50 rounded-lg transition-colors shrink-0" disabled={newQ.options.length <= 2}>
                         <Minus size={16}/>
                       </button>
                     </div>
                   ))}
                   <Button onClick={handleAddOption} variant="secondary" size="small" className="w-full border-dashed text-gray-500">
                     <Plus size={16}/> 選択肢を追加
                   </Button>
                 </div>
               )}
               <textarea value={newQ.explanation} onChange={(e) => setNewQ({...newQ, explanation: e.target.value})} placeholder="解説を入力..." className="w-full px-4 py-3 rounded-xl border-2 border-gray-200 focus:ring-2 focus:ring-green-500 outline-none h-24 resize-none bg-gray-50" />
               <Button onClick={handleCreateQuestion} variant="success" className="w-full">追加する</Button>
            </div>
          </div>
          <div className="bg-white rounded-3xl shadow-sm p-6 space-y-4 border border-blue-100">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-blue-600" /> Excel/CSV一括登録
            </h2>
            <div className="space-y-3">
              <div className="flex items-center gap-2 p-2 bg-blue-50 rounded-lg">
                <span className="text-xs font-bold text-blue-700 whitespace-nowrap">今回アップロード回数:</span>
                <Input type="number" value={uploadBatchNum} onChange={(e) => setUploadBatchNum(e.target.value)} className="w-20 py-1 px-2 text-center text-sm h-8" placeholder="3" />
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
                    <span className="bg-blue-50 text-blue-600 text-[10px] font-bold px-1 py-0.5 rounded text-center border border-blue-100">
                      {q.displayId || '-'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                      <span className="text-[10px] bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full font-bold">{q.category}</span>
                      <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-bold">{q.type}</span>
                      {q.customId && <span className="text-[10px] bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">ID: {q.customId}</span>}
                    </div>
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

  if (!currentQ && view === 'quiz') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 flex-col gap-4">
        <div className="animate-spin h-10 w-10 border-4 border-blue-600 border-t-transparent rounded-full"></div>
        <p className="text-gray-500 font-bold">データを読み込んでいます...</p>
        <p className="text-xs text-gray-400">※ずっと動かない場合はAPIキーを確認してください</p>
      </div>
    );
  }

  let isCorrectDisplay = false;
  if (showExplanation && currentQ) {
    const type = getCurrentType();
    if (type.includes('input')) {
      const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
      const normalizedInput = normalizeString(textInput);
      const correctAnswers = currentQ.correctAnswer.split('|');
      isCorrectDisplay = correctAnswers.some(ans => normalizedInput === normalizeString(ans));
    } else if (type.includes('multi') || type === 'hyper') {
      const correctArr = normalizedCorrectAnswers;
      if (selectedOptions.length === correctArr.length) {
        isCorrectDisplay = selectedOptions.every(opt => 
          correctArr.some(ans => isAnswerMatch(opt, ans))
        );
      } else {
        isCorrectDisplay = false;
      }
    } else {
      isCorrectDisplay = isAnswerMatch(selectedOptions[0], normalizedCorrectAnswers[0]);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white px-4 py-4 shadow-sm flex justify-between items-center sticky top-0 z-20 safe-area-top">
        <button onClick={() => setView('dashboard')} className="text-gray-500 font-bold text-sm bg-gray-100 px-3 py-1.5 rounded-lg hover:bg-gray-200">
          中断
        </button>
        <div className="font-bold text-gray-700 flex flex-col items-center leading-tight">
          <div className="flex items-center gap-2 mb-0.5">
             <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">No.{currentQ?.displayId || (currentQuestionIndex + 1)}</span>
          </div>
          <span className="text-lg">{currentQuestionIndex + 1} <span className="text-sm text-gray-400">/ {questions.length}</span></span>
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
                {getCurrentType() === 'multi' ? '複数選択' : getCurrentType() === 'input' ? '記述' : '単一選択'}
              </span>
            </div>

            {currentQ.caseText && (
              <div className="mb-6 bg-gray-50 border-l-4 border-blue-400 p-4 rounded-r-xl">
                <div className="flex items-center gap-2 mb-2 text-blue-600 font-bold text-sm">
                  <CaseIcon size={16} /> 症例
                </div>
                {currentQ.caseImageUrl && (
                  <div className="mb-4 flex justify-center">
                    <div 
                      className="relative group cursor-zoom-in"
                      onClick={() => setImageModalUrl(currentQ.caseImageUrl)}
                    >
                      <img 
                        src={convertToDirectLink(currentQ.caseImageUrl)} 
                        alt="Case Image" 
                        referrerPolicy="no-referrer"
                        className="max-h-48 rounded-xl shadow-sm border border-blue-100 object-contain bg-white"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl flex items-center justify-center">
                        <Maximize2 className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={24}/>
                      </div>
                    </div>
                  </div>
                )}
                <p className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap">
                  {currentQ.caseText}
                </p>
              </div>
            )}

            <h2 className="text-xl font-bold text-gray-900 leading-relaxed mb-8">{currentQ.questionText}</h2>
            
            {currentQ.imageUrl && (
              <div className="mb-6 flex justify-center">
                <div 
                  className="relative group cursor-zoom-in"
                  onClick={() => setImageModalUrl(currentQ.imageUrl)}
                >
                  <img 
                    src={convertToDirectLink(currentQ.imageUrl)} 
                    alt="Question Image" 
                    referrerPolicy="no-referrer"
                    className="max-h-64 rounded-xl shadow-md border border-gray-100 object-contain bg-gray-50"
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors rounded-xl flex items-center justify-center">
                    <Maximize2 className="text-white opacity-0 group-hover:opacity-100 drop-shadow-md" size={32}/>
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-3">
              {getCurrentType() === 'input' ? (
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
                    <button key={idx} onClick={() => handleOptionSelect(option)} disabled={showExplanation} className={`w-full text-left p-4 rounded-xl transition-all duration-200 flex items-center justify-between text-base leading-snug ${styleClass} active:scale-[0.99]`}>
                      <span>{option}</span>
                      {isSelected && !showExplanation && <CheckCircle size={20} className="text-blue-600 fill-blue-50"/>}
                      {showExplanation && (
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
            
            <div className="bg-white/60 rounded-xl p-4 mb-2">
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">今回の解答</p>
              <p className={`text-lg font-bold break-words ${isCorrectDisplay ? 'text-emerald-700' : 'text-red-600'}`}>
                {getCurrentType().includes('input')
                  ? (textInput || '(未入力)')
                  : (selectedOptions.length > 0 ? selectedOptions.join(', ') : '(未選択)')
                }
              </p>
            </div>

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
                {getCurrentType() === 'input' 
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

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-100 p-4 z-50 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
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

      {imageModalUrl && (
        <div 
          className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setImageModalUrl(null)}
        >
          <div className="relative max-w-4xl max-h-full">
            <button 
              onClick={() => setImageModalUrl(null)}
              className="absolute -top-12 right-0 text-white hover:text-gray-300 p-2"
            >
              <X size={32} />
            </button>
            <img 
              src={convertToDirectLink(imageModalUrl)} 
              alt="Expanded" 
              referrerPolicy="no-referrer"
              className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()} 
            />
          </div>
        </div>
      )}
    </div>
  );
}

