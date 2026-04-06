"use client";

import { useState, useEffect } from "react";
import { Facet, Concept, Topic, Question, MatchingQuestion } from "../types/api";

const KNOWLEDGE_API_URL = "http://localhost:8081"; 
const QUESTIONS_API_URL = "http://localhost:8080";

export default function Home() {
  const [facets, setFacets] = useState<Facet[]>([]);
  const [selectedConcepts, setSelectedConcepts] = useState<Record<string, string[]>>({});
  const [topics, setTopics] = useState<Topic[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [quizState, setQuizState] = useState<"idle" | "topics" | "setup" | "playing" | "results">("idle");
  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);
  
  const [availableQuestions, setAvailableQuestions] = useState<Question[]>([]);
  const [questionCount, setQuestionCount] = useState(10);
  
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [score, setScore] = useState(0);
  
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  
  const [shuffledMatchingValues, setShuffledMatchingValues] = useState<string[]>([]);
  const [matchingAnswers, setMatchingAnswers] = useState<Record<string, string>>({});
  const [isMatchingSubmitted, setIsMatchingSubmitted] = useState(false);

  useEffect(() => {
    const fetchFacets = async () => {
      try {
        const res = await fetch(`${KNOWLEDGE_API_URL}/api/v1/skos`);
        if (res.ok) {
          const data = await res.json();
          setFacets(data.facets || []);
        }
      } catch (error) {
        console.error("Ошибка при загрузке фасетов:", error);
      }
    };
    fetchFacets();
  }, []);

  useEffect(() => {
    const currentQ = questions[currentQIndex];
    if (quizState === "playing" && currentQ?.q_type === "MATCHING") {
      const rightValues = currentQ.payload.pairs.map(p => p.right);
      const distractors = currentQ.payload.distractors || [];
      const combined = [...rightValues, ...distractors];
      
      setShuffledMatchingValues(combined.sort(() => 0.5 - Math.random()));
      setMatchingAnswers({});
      setIsMatchingSubmitted(false);
    }
  }, [currentQIndex, questions, quizState]);

  // ХЕЛПЕР: Умное форматирование дат в тексте
  const formatDateInText = (text: string | undefined | null) => {
    if (!text) return "";
    // Ищем ISO даты вида YYYY-MM-DD или YYYY-MM-DDTHH:mm:ssZ
    const regex = /\b\d{4}-\d{2}-\d{2}(?:T[A-Za-z0-9:.-]+)?\b/g;
    return text.replace(regex, (match) => {
      try {
        const date = new Date(match);
        if (isNaN(date.getTime())) return match;
        // Превращаем в человеческий вид (например, "19 августа 1787 г.")
        return date.toLocaleDateString("ru-RU", {
          year: "numeric",
          month: "long",
          day: "numeric"
        });
      } catch {
        return match;
      }
    });
  };

  const getAllConceptIds = (concept: Concept): string[] => {
    let ids = [concept.id];
    if (concept.children) {
      concept.children.forEach(child => {
        ids = [...ids, ...getAllConceptIds(child)];
      });
    }
    return ids;
  };

  const handleToggleConcept = (schemeId: string, concept: Concept) => {
    const idsToToggle = getAllConceptIds(concept);

    setSelectedConcepts((prev) => {
      const schemeConcepts = prev[schemeId] || [];
      const isCurrentlySelected = schemeConcepts.includes(concept.id);

      if (isCurrentlySelected) {
        return { 
          ...prev, 
          [schemeId]: schemeConcepts.filter((id) => !idsToToggle.includes(id)) 
        };
      } else {
        return { 
          ...prev, 
          [schemeId]: Array.from(new Set([...schemeConcepts, ...idsToToggle])) 
        };
      }
    });
  };

  const handleApplyFilters = async () => {
    setIsLoading(true);
    try {
      const queryParams = new URLSearchParams();
      Object.entries(selectedConcepts).forEach(([schemeId, concepts]) => {
        if (concepts.length > 0) queryParams.append(schemeId, concepts.join(","));
      });

      const topicsRes = await fetch(`${KNOWLEDGE_API_URL}/api/v1/topics?${queryParams.toString()}`);
      if (!topicsRes.ok) throw new Error("Ошибка при поиске топиков");
      const topicsData: { topics: Topic[] } = await topicsRes.json();
      
      if (!topicsData.topics || topicsData.topics.length === 0) {
        alert("По этим фильтрам топики не найдены.");
        setQuizState("idle");
      } else {
        setTopics(topicsData.topics);
        setQuizState("topics");
      }
    } catch (error) {
      console.error(error);
      alert("Не удалось связаться с бэкендом.");
    }
    setIsLoading(false);
  };

  const handleSelectTopic = async (topic: Topic) => {
    setIsLoading(true);
    try {
      const res = await fetch(`${QUESTIONS_API_URL}/api/v1/questions?topic_slug=${topic.slug}&quantity=0`);
      if (!res.ok) throw new Error("Ошибка загрузки вопросов");
      const data: Question[] = await res.json();

      if (!data || data.length === 0) {
        alert(`Вопросы для темы "${topic.name}" еще не готовы. Попробуйте другую тему.`);
      } else {
        setAvailableQuestions(data);
        setSelectedTopic(topic);
        setQuestionCount(Math.min(5, data.length));
        setQuizState("setup");
      }
    } catch (error) {
      console.error(error);
      alert("Не удалось загрузить вопросы для этого топика.");
    } finally {
      setIsLoading(false);
    }
  };

  const startQuiz = () => {
    const shuffled = [...availableQuestions].sort(() => 0.5 - Math.random());
    setQuestions(shuffled.slice(0, questionCount));
    
    setQuizState("playing");
    setCurrentQIndex(0);
    setScore(0);
    setSelectedAnswer(null);
    setIsMatchingSubmitted(false);
  };

  const nextQuestion = () => {
    if (currentQIndex + 1 < questions.length) {
      setCurrentQIndex((i) => i + 1);
      setSelectedAnswer(null);
      setIsMatchingSubmitted(false); 
    } else {
      setQuizState("results");
    }
  };

  const handleMCQAnswer = (key: string) => {
    if (selectedAnswer) return;
    setSelectedAnswer(key);
    
    const q = questions[currentQIndex];
    if (q.q_type === "MCQ" && key === q.payload.correct_key) {
      setScore((s) => s + 1);
    }
    // Больше никаких setTimeout, ждем клика от юзера!
  };

  const handleCheckMatching = () => {
    setIsMatchingSubmitted(true);
    const q = questions[currentQIndex] as MatchingQuestion;
    let isAllCorrect = true;
    
    q.payload.pairs.forEach(pair => {
      if (matchingAnswers[pair.left] !== pair.right) {
        isAllCorrect = false;
      }
    });

    if (isAllCorrect) setScore((s) => s + 1);
    // Больше никаких setTimeout, ждем клика от юзера!
  };

  const ConceptNode = ({ concept, schemeId, level = 0 }: { concept: Concept, schemeId: string, level?: number }) => {
    const isSelected = (selectedConcepts[schemeId] || []).includes(concept.id);
    return (
      <div className="flex flex-col mt-1" style={{ paddingLeft: level > 0 ? '1rem' : '0' }}>
        <label className="flex items-center space-x-2 cursor-pointer hover:bg-gray-100 p-1 rounded transition-colors">
          <input
            type="checkbox"
            checked={isSelected}
            onChange={() => handleToggleConcept(schemeId, concept)}
            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4"
          />
          <span className={`text-sm ${level === 0 ? 'font-medium text-gray-800' : 'text-gray-600'}`}>{concept.label}</span>
        </label>
        {concept.children && (
          <div className="border-l-2 border-gray-100 ml-2 mt-1">
            {concept.children.map(child => <ConceptNode key={child.id} concept={child} schemeId={schemeId} level={level + 1} />)}
          </div>
        )}
      </div>
    );
  };

  const renderQuestion = () => {
    const q = questions[currentQIndex];

    return (
      <div className="w-full max-w-2xl bg-white p-8 rounded-2xl shadow-lg border border-gray-100 animate-in fade-in zoom-in-95">
        <div className="mb-6 flex justify-between items-center text-sm font-medium text-gray-500">
          <span className="uppercase tracking-wide font-bold">{q.q_type} • Вопрос {currentQIndex + 1} из {questions.length}</span>
          <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-bold">Счет: {score}</span>
        </div>
        
        {/* Пропускаем stem через форматтер дат */}
        <h2 className="text-2xl font-bold mb-6 text-gray-800 leading-snug">{formatDateInText(q.stem)}</h2>

        {q.q_type === "MCQ" && q.payload.image_url && (
          <div className="mb-8 flex justify-center">
            <img 
              src={q.payload.image_url} 
              alt="Иллюстрация к вопросу" 
              className="max-w-full h-auto max-h-72 rounded-xl shadow-sm border border-gray-200 object-contain"
            />
          </div>
        )}

        {q.q_type === "MATCHING" && (
          <div className="space-y-4">
            <p className="text-sm text-gray-500 mb-4">Подберите правильную пару для каждого элемента. Будьте внимательны: есть лишние варианты!</p>
            {q.payload.pairs.map((pair) => {
              const isCorrect = isMatchingSubmitted && matchingAnswers[pair.left] === pair.right;
              const isWrong = isMatchingSubmitted && matchingAnswers[pair.left] !== pair.right;
              
              return (
                <div key={pair.left} className={`flex flex-col md:flex-row md:items-center justify-between p-4 rounded-xl border ${isCorrect ? 'bg-green-50 border-green-300' : isWrong ? 'bg-red-50 border-red-300' : 'bg-gray-50 border-gray-200'}`}>
                  {/* Форматируем левую часть */}
                  <span className="font-medium text-gray-800 mb-2 md:mb-0 w-1/2 pr-4">{formatDateInText(pair.left)}</span>
                  <select
                    disabled={isMatchingSubmitted}
                    value={matchingAnswers[pair.left] || ""}
                    onChange={(e) => setMatchingAnswers(prev => ({ ...prev, [pair.left]: e.target.value }))}
                    className="w-full md:w-1/2 p-2 border border-gray-300 bg-white rounded-lg focus:ring-blue-500 focus:border-blue-500 disabled:opacity-75"
                  >
                    <option value="" disabled>Выберите пару...</option>
                    {shuffledMatchingValues.map((val, idx) => (
                      <option key={idx} value={val}>{formatDateInText(val)}</option>
                    ))}
                  </select>
                </div>
              );
            })}
            
            {/* Скрываем кнопку 'Ответить', если уже ответили */}
            {!isMatchingSubmitted && (
              <button
                onClick={handleCheckMatching}
                disabled={Object.keys(matchingAnswers).length !== q.payload.pairs.length}
                className="mt-6 w-full bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md"
              >
                Ответить
              </button>
            )}
          </div>
        )}

        {q.q_type === "MCQ" && (
          <div className="space-y-3">
            {Object.entries(q.payload.options).map(([key, text]) => {
              let btnClass = "w-full text-left p-4 rounded-xl border-2 transition-all font-medium ";
              if (selectedAnswer) {
                if (key === q.payload.correct_key) btnClass += "bg-green-50 border-green-500 text-green-800";
                else if (key === selectedAnswer) btnClass += "bg-red-50 border-red-500 text-red-800";
                else btnClass += "bg-gray-50 border-gray-200 text-gray-400 opacity-50";
              } else {
                btnClass += "bg-white border-gray-200 hover:border-blue-500 hover:bg-blue-50 text-gray-700 cursor-pointer shadow-sm hover:shadow";
              }

              return (
                <button key={key} onClick={() => handleMCQAnswer(key)} disabled={!!selectedAnswer} className={btnClass}>
                  <span className="inline-block w-8 text-center font-bold mr-2 text-gray-400">{key}</span> 
                  {/* Форматируем ответ */}
                  {formatDateInText(text)}
                </button>
              );
            })}
          </div>
        )}

        {/* Блок с пояснением */}
        {(selectedAnswer || isMatchingSubmitted) && q.justification && (
          <div className="mt-8 p-5 bg-blue-50 border border-blue-100 rounded-xl text-blue-900 text-sm leading-relaxed animate-in fade-in zoom-in-95">
            <strong className="block mb-1 text-blue-700">Объяснение:</strong> 
            {formatDateInText(q.justification)}
          </div>
        )}

        {/* НОВАЯ КНОПКА: Переход к следующему вопросу */}
        {(selectedAnswer || isMatchingSubmitted) && (
          <div className="mt-8 pt-6 border-t border-gray-100 flex justify-end animate-in fade-in">
            <button
              onClick={nextQuestion}
              className="bg-gray-900 text-white font-bold py-3 px-8 rounded-xl hover:bg-gray-800 transition-colors shadow-md"
            >
              {currentQIndex + 1 < questions.length ? "Следующий вопрос ➔" : "Завершить квиз 🎉"}
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col md:flex-row font-sans text-gray-900">
      <aside className="w-full md:w-80 bg-white border-r border-gray-200 h-screen sticky top-0 overflow-y-auto p-6 flex flex-col shadow-sm z-10">
        <h2 className="text-xl font-bold mb-6 text-gray-800">Настройка квиза</h2>
        {facets.length === 0 ? (
          <p className="text-sm text-gray-500 animate-pulse">Загрузка категорий...</p>
        ) : (
          <div className="flex-grow space-y-6">
            {facets.map(facet => (
              <div key={facet.id}>
                <h3 className="text-sm font-bold uppercase tracking-wider text-gray-400 mb-3">{facet.label}</h3>
                <div className="space-y-1">
                  {facet.concepts.map(concept => <ConceptNode key={concept.id} concept={concept} schemeId={facet.id} />)}
                </div>
              </div>
            ))}
          </div>
        )}
        <div className="mt-8 pt-4 border-t border-gray-100 sticky bottom-0 bg-white">
          <button onClick={handleApplyFilters} disabled={isLoading || facets.length === 0} className="w-full bg-blue-600 text-white font-semibold py-3 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors shadow-md">
            {isLoading ? "Загрузка..." : "Применить фильтры"}
          </button>
        </div>
      </aside>

      <main className="flex-1 p-8 md:p-12 overflow-y-auto flex items-center justify-center">
        {quizState === "idle" && (
          <div className="text-center max-w-lg">
            <h1 className="text-4xl font-extrabold text-gray-900 mb-4">Добро пожаловать</h1>
            <p className="text-lg text-gray-500">Выберите категории слева и нажмите "Применить фильтры", чтобы найти доступные темы.</p>
          </div>
        )}

        {quizState === "topics" && (
          <div className="w-full max-w-4xl animate-in fade-in zoom-in-95">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Выберите тему</h2>
            <p className="text-gray-500 mb-8">Найдено тем: {topics.length}. Нажмите на любую, чтобы настроить квиз.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {topics.map(topic => (
                <button 
                  key={topic.slug} 
                  onClick={() => handleSelectTopic(topic)}
                  disabled={isLoading}
                  className="text-left p-6 bg-white border border-gray-200 rounded-xl shadow-sm hover:shadow-md hover:border-blue-400 hover:bg-blue-50 transition-all group disabled:opacity-50"
                >
                  <h3 className="text-xl font-bold text-gray-800 group-hover:text-blue-700 mb-2">{topic.name}</h3>
                  {topic.description && (
                     <p className="text-sm text-gray-600 line-clamp-2">{topic.description}</p>
                  )}
                </button>
              ))}
            </div>
          </div>
        )}

        {quizState === "setup" && selectedTopic && (
          <div className="w-full max-w-lg bg-white p-10 rounded-2xl shadow-lg border border-gray-100 animate-in fade-in zoom-in-95">
            <h2 className="text-3xl font-extrabold text-gray-900 mb-2">Настройка квиза</h2>
            <h3 className="text-xl font-medium text-blue-600 mb-8">{selectedTopic.name}</h3>

            <div className="mb-8">
              <label className="block text-gray-700 font-bold mb-4 text-lg">
                Количество вопросов: <span className="text-blue-600 text-2xl ml-2">{questionCount}</span> <span className="text-gray-400 text-sm font-normal">из {availableQuestions.length}</span>
              </label>
              
              <input 
                type="range" 
                min={1} 
                max={availableQuestions.length} 
                value={questionCount} 
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full h-3 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              
              <div className="flex justify-between text-xs text-gray-400 mt-2 font-medium">
                <span>1</span>
                <span>{availableQuestions.length}</span>
              </div>
            </div>

            <div className="flex gap-4 mt-10">
               <button onClick={() => setQuizState("topics")} className="w-1/3 bg-gray-100 text-gray-700 font-bold py-3 px-4 rounded-xl hover:bg-gray-200 transition-colors">
                 Назад
               </button>
               <button onClick={startQuiz} className="w-2/3 bg-blue-600 text-white font-bold py-3 px-4 rounded-xl hover:bg-blue-700 transition-colors shadow-md">
                 Начать квиз
               </button>
            </div>
          </div>
        )}

        {quizState === "playing" && questions.length > 0 && renderQuestion()}

        {quizState === "results" && (
          <div className="w-full max-w-md bg-white p-10 rounded-2xl shadow-lg text-center border border-gray-100 animate-in zoom-in-95">
            <div className="text-6xl mb-6">🎉</div>
            <h2 className="text-3xl font-extrabold mb-4 text-gray-900">Квиз завершен!</h2>
            <p className="text-xl text-gray-600 mb-8">Ваш результат: <span className="font-bold text-blue-600">{score}</span> из {questions.length}</p>
            <button onClick={() => { setQuizState("setup"); }} className="w-full bg-blue-600 text-white font-bold py-3 px-6 rounded-xl hover:bg-blue-700 transition-colors shadow-md mb-3">
              Пройти снова
            </button>
            <button onClick={() => { setQuizState("topics"); }} className="w-full bg-gray-900 text-white font-bold py-3 px-6 rounded-xl hover:bg-gray-800 transition-colors shadow-md mb-3">
              Вернуться к темам
            </button>
            <button onClick={() => { setQuizState("idle"); setSelectedConcepts({}); setTopics([]); }} className="w-full bg-gray-100 text-gray-700 font-bold py-3 px-6 rounded-xl hover:bg-gray-200 transition-colors">
              Сбросить фильтры
            </button>
          </div>
        )}
      </main>
    </div>
  );
}