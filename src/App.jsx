import React, { useState, useEffect } from 'react';
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
  writeBatch
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
  List
} from 'lucide-react';

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
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'med-study-app';

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

// --- Sample Data ---
const INITIAL_QUESTIONS = [
  {
    id: 'q1',
    type: 'single',
    category: '循環器',
    questionText: '僧帽弁閉鎖不全症(MR)の聴診所見として最も適切なものはどれか。',
    options: ['拡張期ランブル', '収縮期駆出性雑音', '全収縮期雑音', '連続性雑音', '拡張早期灌水様雑音'],
    correctAnswer: '全収縮期雑音',
    explanation: '僧帽弁閉鎖不全症(MR)では、左室から左房への逆流が生じるため、全収縮期雑音が心尖部で聴取される。'
  }
];

// --- Components ---
const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const baseStyle = "px-4 py-3 rounded-lg font-bold transition-all duration-200 flex items-center justify-center gap-2 shadow-sm active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed";
  const variants = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary: "bg-white text-gray-700 border border-gray-300 hover:bg-gray-50",
    success: "bg-green-600 text-white hover:bg-green-700",
    danger: "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100",
    outline: "bg-transparent text-blue-600 border border-blue-600 hover:bg-blue-50"
  };
  return (
    <button onClick={onClick} className={`${baseStyle} ${variants[variant]} ${className}`} disabled={disabled}>
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
    className="w-full px-4 py-3 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 outline-none transition-all text-lg"
    {...props}
  />
);

// --- Main App ---
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('auth');
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

  // Admin State
  const [newQ, setNewQ] = useState({
    type: 'single', category: '', questionText: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: ''
  });
  const [adminSelectedIndices, setAdminSelectedIndices] = useState([]);

  // --- Auth & Init ---
  useEffect(() => {
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
        loadUserData(u.uid);
      } else {
        setView('auth');
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Data Loading ---
  const loadUserData = async (uid) => {
    try {
      const qRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
      const qSnap = await getDocs(qRef);
      let loadedQuestions = [];
      if (qSnap.empty) {
        const seedPromises = INITIAL_QUESTIONS.map(q => 
          setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', q.id), q)
        );
        await Promise.all(seedPromises);
        loadedQuestions = INITIAL_QUESTIONS;
      } else {
        loadedQuestions = qSnap.docs.map(doc => ({...doc.data(), id: doc.id}));
      }
      setQuestions(loadedQuestions);

      const historyRef = collection(db, 'artifacts', appId, 'users', uid, 'history');
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
    const csvContent = "\uFEFF" + [headers, example1].join("\n");
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

          newQuestions.push({
            type: type.trim(),
            category: category.trim(),
            questionText: questionText.trim(),
            options: type === 'input' ? [] : options,
            correctAnswer,
            explanation: explanation.trim(),
            createdAt: new Date().toISOString()
          });
        }

        if (newQuestions.length === 0) {
          setImportStatus('有効なデータが見つかりませんでした。');
          return;
        }

        setImportStatus(`${newQuestions.length}件のデータを登録中...`);
        const qColRef = collection(db, 'artifacts', appId, 'public', 'data', 'questions');
        const promises = newQuestions.map(q => addDoc(qColRef, q));
        await Promise.all(promises);

        setImportStatus(`完了！ ${newQuestions.length}件の問題を追加しました。`);
        loadUserData(user.uid);
        setTimeout(() => setImportStatus(''), 3000);

      } catch (error) {
        console.error(error);
        setImportStatus('エラーが発生しました: CSVの形式を確認してください');
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

  // --- Quiz Logic (Sorted Review) ---
  const startQuiz = (selectedMode) => {
    setMode(selectedMode);
    let targetQuestions = [...questions];
    
    if (selectedMode === 'review') {
      // 1. 間違えている問題（isCorrect: false）のみ抽出
      targetQuestions = targetQuestions.filter(q => 
        userHistory[q.id] && userHistory[q.id].isCorrect === false
      );

      // 2. 「間違えた回数(wrongCount)」が多い順に並び替え
      targetQuestions.sort((a, b) => {
        const countA = userHistory[a.id]?.wrongCount || 0;
        const countB = userHistory[b.id]?.wrongCount || 0;
        return countB - countA; // 降順（多い順）
      });

      if (targetQuestions.length === 0) {
        alert("間違えた問題はありません！");
        return;
      }
    } else {
      // 通常モードはランダム
      targetQuestions.sort(() => Math.random() - 0.5);
    }

    setQuestions(targetQuestions);
    setCurrentQuestionIndex(0);
    resetQuestionState();
    setView('quiz');
  };

  const resetQuestionState = () => {
    setSelectedOptions([]);
    setTextInput('');
    setShowExplanation(false);
  };

  const handleOptionSelect = (option) => {
    if (showExplanation) return;
    const currentQ = questions[currentQuestionIndex];

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
    const currentQ = questions[currentQuestionIndex];
    let isCorrect = false;

    if (currentQ.type === 'input') {
      const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
      isCorrect = normalize(textInput) === normalize(currentQ.correctAnswer);
    } else if (currentQ.type === 'single') {
      isCorrect = selectedOptions[0] === currentQ.correctAnswer;
    } else if (currentQ.type === 'multi') {
      const sortedSelected = [...selectedOptions].sort();
      const sortedCorrect = [...currentQ.correctAnswer].sort();
      isCorrect = JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect);
    }

    if (user) {
      // 既存の履歴を取得
      const prevHistory = userHistory[currentQ.id] || {};
      const currentWrongCount = prevHistory.wrongCount || 0;

      // 不正解なら wrongCount を +1 する
      const newWrongCount = isCorrect ? currentWrongCount : currentWrongCount + 1;

      const resultData = {
        isCorrect,
        timestamp: new Date().toISOString(),
        lastAnswer: currentQ.type === 'input' ? textInput : selectedOptions,
        wrongCount: newWrongCount // ★ここを追加
      };
      
      setUserHistory(prev => ({ ...prev, [currentQ.id]: resultData }));
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'history', currentQ.id), resultData);
    }
    setShowExplanation(true);
  };

  const nextQuestion = () => {
    if (currentQuestionIndex < questions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
      resetQuestionState();
    } else {
      setView('dashboard');
    }
  };

  // --- Admin Logic (Delete Added) ---
  const handleCreateQuestion = async () => {
    if (!newQ.questionText || !newQ.category || !newQ.explanation) {
      alert('必須項目を入力してください');
      return;
    }
    let finalCorrectAnswer;
    const cleanOptions = newQ.options.filter(o => o.trim() !== '');

    if (newQ.type === 'input') {
      if (!newQ.correctAnswerInput) {
        alert('正解を入力してください');
        return;
      }
      finalCorrectAnswer = newQ.correctAnswerInput;
    } else {
      if (adminSelectedIndices.length === 0) {
        alert('正解の選択肢を選んでください');
        return;
      }
      if (newQ.type === 'single') {
        finalCorrectAnswer = cleanOptions[adminSelectedIndices[0]];
      } else { 
        finalCorrectAnswer = adminSelectedIndices.map(i => cleanOptions[i]);
      }
    }

    const newQuestionData = {
      type: newQ.type,
      category: newQ.category,
      questionText: newQ.questionText,
      options: newQ.type === 'input' ? [] : cleanOptions,
      correctAnswer: finalCorrectAnswer,
      explanation: newQ.explanation,
      createdAt: new Date().toISOString()
    };

    try {
      const docRef = await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'questions'), newQuestionData);
      setQuestions([...questions, { ...newQuestionData, id: docRef.id }]);
      alert('問題を追加しました！');
      
      setNewQ({ type: 'single', category: '', questionText: '', options: ['', '', '', '', ''], correctAnswerInput: '', explanation: '' });
      setAdminSelectedIndices([]);
    } catch (error) {
      alert("エラー: " + error.message);
    }
  };

  const toggleAdminCorrectOption = (index) => {
    if (newQ.type === 'single') {
      setAdminSelectedIndices([index]);
    } else {
      if (adminSelectedIndices.includes(index)) {
        setAdminSelectedIndices(adminSelectedIndices.filter(i => i !== index));
      } else {
        setAdminSelectedIndices([...adminSelectedIndices, index]);
      }
    }
  };

  // ★ 削除機能
  const handleDeleteQuestion = async (id) => {
    if (!confirm("本当にこの問題を削除してもよろしいですか？")) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'questions', id));
      setQuestions(prev => prev.filter(q => q.id !== id));
    } catch (error) {
      alert("削除に失敗しました: " + error.message);
    }
  };

  // --- UI ---
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-50 text-blue-600">Loading...</div>;

  if (view === 'auth') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md">
          <div className="text-center mb-8">
            <div className="bg-blue-600 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"><Brain className="text-white w-8 h-8" /></div>
            <h1 className="text-2xl font-bold text-gray-800">Medical QB</h1>
            <p className="text-gray-500">医学生のための学習支援アプリ</p>
          </div>
          <form onSubmit={handleAuth} className="space-y-4">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
            {authError && <p className="text-red-500 text-sm">{authError}</p>}
            <Button type="submit" className="w-full">{authMode === 'login' ? 'ログイン' : '新規登録'}</Button>
          </form>
          <div className="mt-6 text-center text-sm">
            <button onClick={() => setAuthMode(authMode === 'login' ? 'signup' : 'login')} className="text-blue-600 hover:underline">
              {authMode === 'login' ? 'アカウントを作成する' : 'ログイン画面に戻る'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'dashboard') {
    const wrongCount = Object.values(userHistory).filter(h => !h.isCorrect).length;
    const totalAnswered = Object.keys(userHistory).length;
    return (
      <div className="min-h-screen bg-gray-50 pb-20">
        <header className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-10">
          <h1 className="text-xl font-bold text-gray-800 flex items-center gap-2"><Activity className="text-blue-600" /> Medical QB</h1>
          <button onClick={() => {signOut(auth); setView('auth');}} className="text-gray-500 hover:text-red-500"><LogOut size={20} /></button>
        </header>
        <main className="p-6 max-w-2xl mx-auto space-y-6">
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 rounded-2xl p-6 text-white shadow-lg">
            <h2 className="text-lg font-semibold opacity-90 mb-1">学習状況</h2>
            <div className="flex gap-8 mt-4">
              <div><p className="text-3xl font-bold">{totalAnswered}</p><p className="text-sm opacity-75">回答数</p></div>
              <div><p className="text-3xl font-bold text-orange-200">{wrongCount}</p><p className="text-sm opacity-75">要復習</p></div>
            </div>
          </div>
          <div className="grid gap-4">
            <button onClick={() => startQuiz('all')} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group">
              <div className="flex items-center gap-4"><div className="bg-blue-100 p-3 rounded-lg text-blue-600"><BookOpen size={24} /></div><div className="text-left"><h3 className="font-bold text-gray-800">全問演習</h3><p className="text-sm text-gray-500">ランダムに出題</p></div></div><ChevronRight className="text-gray-300 group-hover:text-blue-600" />
            </button>
            <button onClick={() => startQuiz('review')} disabled={wrongCount === 0} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between hover:shadow-md transition-all group disabled:opacity-50">
              <div className="flex items-center gap-4"><div className="bg-orange-100 p-3 rounded-lg text-orange-600"><RefreshCw size={24} /></div><div className="text-left"><h3 className="font-bold text-gray-800">復習モード</h3><p className="text-sm text-gray-500">苦手(誤答数順)に出題</p></div></div><ChevronRight className="text-gray-300 group-hover:text-orange-600" />
            </button>
          </div>
          <div className="pt-4 border-t border-gray-200">
             <button onClick={() => setView('admin')} className="w-full bg-gray-100 p-4 rounded-xl text-gray-600 font-bold flex items-center justify-center gap-2 hover:bg-gray-200 transition-colors">
              <Plus size={20} /> 問題管理・作成
            </button>
          </div>
        </main>
      </div>
    );
  }

  if (view === 'admin') {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm px-6 py-4 flex items-center sticky top-0 z-10 gap-4">
          <button onClick={() => setView('dashboard')} className="text-gray-500 hover:text-gray-800"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold text-gray-800">問題管理</h1>
        </header>

        <main className="p-6 max-w-2xl mx-auto pb-24 space-y-8">
          
          {/* CSV Import */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4 border border-blue-100">
            <h2 className="font-bold text-gray-800 flex items-center gap-2">
              <FileText className="text-green-600" /> Excel/CSVから一括登録
            </h2>
            <div className="flex gap-4">
              <Button onClick={downloadTemplate} variant="secondary" className="text-sm">
                <Download size={16} /> テンプレートDL
              </Button>
              <div className="relative">
                <input 
                  type="file" 
                  accept=".csv" 
                  onChange={handleFileUpload}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <Button variant="success" className="text-sm">
                  <Upload size={16} /> CSVをアップロード
                </Button>
              </div>
            </div>
            {importStatus && <p className="text-sm text-blue-600 font-bold">{importStatus}</p>}
          </div>

          {/* Manual Create */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-6">
            <h2 className="font-bold text-gray-800 border-b pb-2">手動で1問追加</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">タイプ</label>
                <select className="w-full p-3 rounded-lg border border-gray-300 bg-white" value={newQ.type} onChange={(e) => {setNewQ({...newQ, type: e.target.value}); setAdminSelectedIndices([]);}}>
                  <option value="single">単一選択 (5択)</option>
                  <option value="multi">複数選択</option>
                  <option value="input">記述/穴埋め</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-2">カテゴリ</label>
                <Input value={newQ.category} onChange={(e) => setNewQ({...newQ, category: e.target.value})} placeholder="例: 循環器" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">問題文</label>
              <textarea className="w-full p-3 rounded-lg border border-gray-300 h-24 outline-none" placeholder="問題文..." value={newQ.questionText} onChange={(e) => setNewQ({...newQ, questionText: e.target.value})} />
            </div>
            {newQ.type !== 'input' && (
              <div className="space-y-3">
                <label className="block text-sm font-bold text-gray-700">選択肢 <span className="text-xs font-normal text-red-500 ml-2">※正解をクリック</span></label>
                {newQ.options.map((opt, idx) => (
                  <div key={idx} className="flex items-center gap-3">
                    <button onClick={() => toggleAdminCorrectOption(idx)} className={`w-8 h-8 rounded-full border flex items-center justify-center flex-shrink-0 ${adminSelectedIndices.includes(idx) ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-gray-300'}`}><CheckCircle size={16} /></button>
                    <Input value={opt} onChange={(e) => {const newOpts = [...newQ.options]; newOpts[idx] = e.target.value; setNewQ({...newQ, options: newOpts});}} placeholder={`選択肢 ${idx + 1}`} />
                  </div>
                ))}
              </div>
            )}
            {newQ.type === 'input' && (
              <div><label className="block text-sm font-bold text-gray-700 mb-2">正解</label><Input value={newQ.correctAnswerInput} onChange={(e) => setNewQ({...newQ, correctAnswerInput: e.target.value})} placeholder="例: TRAb" /></div>
            )}
            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">解説</label>
              <textarea className="w-full p-3 rounded-lg border border-gray-300 h-24 outline-none" placeholder="解説..." value={newQ.explanation} onChange={(e) => setNewQ({...newQ, explanation: e.target.value})} />
            </div>
            <Button onClick={handleCreateQuestion} className="w-full mt-4"><Save size={20} /> 保存して追加</Button>
          </div>

          {/* List & Delete */}
          <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
             <h2 className="font-bold text-gray-800 flex items-center gap-2 border-b pb-2">
              <List className="text-gray-600" /> 登録済み問題一覧 ({questions.length})
            </h2>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {questions.map((q) => (
                <div key={q.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">{q.category}</span>
                      <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">{q.type}</span>
                    </div>
                    <p className="text-sm font-bold text-gray-800 line-clamp-1">{q.questionText}</p>
                  </div>
                  <button 
                    onClick={() => handleDeleteQuestion(q.id)}
                    className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors"
                    title="削除"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
              {questions.length === 0 && <p className="text-gray-400 text-center py-4">問題がありません</p>}
            </div>
          </div>
        </main>
      </div>
    );
  }

  // 4. Quiz Screen
  const currentQ = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;
  const isReviewMode = mode === 'review';
  const canCheck = currentQ.type === 'input' ? textInput.length > 0 : selectedOptions.length > 0;
  
  let isCorrectDisplay = false;
  if (showExplanation) {
    if (currentQ.type === 'input') {
      const normalize = (str) => str.replace(/\s+/g, '').toLowerCase();
      isCorrectDisplay = normalize(textInput) === normalize(currentQ.correctAnswer);
    } else if (currentQ.type === 'single') {
      isCorrectDisplay = selectedOptions[0] === currentQ.correctAnswer;
    } else if (currentQ.type === 'multi') {
      const sortedSelected = [...selectedOptions].sort();
      const sortedCorrect = [...currentQ.correctAnswer].sort();
      isCorrectDisplay = JSON.stringify(sortedSelected) === JSON.stringify(sortedCorrect);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white px-4 py-3 shadow-sm flex justify-between items-center sticky top-0 z-10">
        <button onClick={() => setView('dashboard')} className="text-gray-500 hover:text-gray-700 text-sm">中断する</button>
        <div className="font-bold text-gray-700">Q{currentQuestionIndex + 1} / {questions.length}{isReviewMode && <span className="ml-2 text-xs bg-orange-100 text-orange-600 px-2 py-1 rounded-full">復習</span>}</div>
        <div className="w-10"></div>
      </div>
      <div className="flex-1 overflow-y-auto p-4 pb-32 max-w-2xl mx-auto w-full">
        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-1 rounded">{currentQ.category}</span>
            <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-1 rounded">{currentQ.type === 'multi' ? '複数選択' : currentQ.type === 'input' ? '記述' : '単一選択'}</span>
          </div>
          <h2 className="text-xl font-bold text-gray-900 leading-relaxed mb-6">{currentQ.questionText}</h2>
          <div className="space-y-3">
            {currentQ.type === 'input' ? (
              <div className="my-8"><Input value={textInput} onChange={(e) => setTextInput(e.target.value)} placeholder="解答を入力" onKeyDown={(e) => e.key === 'Enter' && !showExplanation && checkAnswer()} disabled={showExplanation} /></div>
            ) : (
              currentQ.options.map((option, idx) => {
                const isSelected = selectedOptions.includes(option);
                let styleClass = "border-gray-200 hover:bg-gray-50";
                if (showExplanation) {
                  const isAnswer = Array.isArray(currentQ.correctAnswer) ? currentQ.correctAnswer.includes(option) : currentQ.correctAnswer === option;
                  if (isAnswer) styleClass = "bg-green-50 border-green-500 text-green-700 font-bold";
                  else if (isSelected && !isAnswer) styleClass = "bg-red-50 border-red-300 text-red-400";
                  else styleClass = "opacity-50 border-gray-100";
                } else {
                  if (isSelected) styleClass = "bg-blue-50 border-blue-500 text-blue-700 font-bold shadow-sm";
                }
                return (
                  <button key={idx} onClick={() => handleOptionSelect(option)} disabled={showExplanation} className={`w-full text-left p-4 rounded-xl border-2 transition-all duration-200 flex items-center justify-between ${styleClass}`}>
                    <span>{option}</span>
                    {(isSelected || (showExplanation && ((Array.isArray(currentQ.correctAnswer) && currentQ.correctAnswer.includes(option)) || currentQ.correctAnswer === option))) && <CheckCircle size={20} className={showExplanation ? "text-green-600" : "text-blue-600"} />}
                  </button>
                );
              })
            )}
          </div>
        </div>
        {showExplanation && (
          <div className={`rounded-2xl p-6 shadow-sm border-l-4 animate-in fade-in slide-in-from-bottom-4 duration-500 ${isCorrectDisplay ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
            <div className="flex items-center gap-3 mb-4">{isCorrectDisplay ? <CheckCircle className="text-green-600 w-8 h-8" /> : <XCircle className="text-red-500 w-8 h-8" />}<span className={`text-xl font-bold ${isCorrectDisplay ? 'text-green-800' : 'text-red-800'}`}>{isCorrectDisplay ? '正解！' : '不正解...'}</span></div>
            <div className="mb-4"><p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1">正解</p><p className="text-lg font-bold text-gray-900">{Array.isArray(currentQ.correctAnswer) ? currentQ.correctAnswer.join(', ') : currentQ.correctAnswer}</p></div>
            <div className="border-t border-gray-200/50 pt-4 mt-4"><p className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">解説</p><p className="text-gray-800 leading-relaxed text-sm">{currentQ.explanation}</p></div>
          </div>
        )}
      </div>
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 z-20 safe-area-bottom">
        <div className="max-w-2xl mx-auto">
          {!showExplanation ? (
            <Button onClick={checkAnswer} className="w-full" disabled={!canCheck}>解答する</Button>
          ) : (
            <Button onClick={nextQuestion} className="w-full" variant={isLastQuestion ? "secondary" : "primary"}>{isLastQuestion ? '学習を終了して結果を見る' : '次の問題へ'}</Button>
          )}
        </div>
      </div>
    </div>
  );
}