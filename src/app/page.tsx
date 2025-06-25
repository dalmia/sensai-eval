'use client';

import { useState, useMemo, useEffect, useRef } from 'react';

// Types
interface Metadata {
  stage: 'router' | 'query_rewrite' | 'feedback';
  task_id: number;
  user_id: number;
  type: string;
  question_id: number;
  question_type: string;
  question_purpose: string;
  question_input_type: string;
  question_has_context: boolean;
  course: {
    id: number;
    name: string;
  };
  milestone: {
    id: number;
    name: string;
  };
  org: {
    id: number;
    name: string;
  };
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

interface Conversation {
  id: string;
  metadata: Metadata;
  messages: ChatMessage[];
  createdAt: string;
  annotation?: 'correct' | 'wrong' | null;
}

interface AnnotationQueue {
  id: string;
  name: string;
  runs: Conversation[];
  createdAt: string;
}

// Dummy data
const dummyConversations: Conversation[] = [
  {
    id: '1',
    createdAt: '2024-01-15T10:30:00Z',
    annotation: 'correct',
    metadata: {
      stage: 'router',
      task_id: 3634,
      user_id: 2503,
      type: 'quiz',
      question_id: 7676,
      question_type: 'subjective',
      question_purpose: 'practice',
      question_input_type: 'code',
      question_has_context: false,
      course: { id: 278, name: 'CSS' },
      milestone: { id: 901, name: 'Advanced CSS Task Practice' },
      org: { id: 249, name: 'Karka Academy' }
    },
    messages: [
      { role: 'user', content: 'How do I center a div in CSS?', timestamp: '2024-01-15T10:30:00Z' },
      { role: 'assistant', content: 'There are several ways to center a div in CSS. Here are the most common methods:\n\n1. **Flexbox (recommended)**:\n```css\n.parent {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n}\n```\n\n2. **CSS Grid**:\n```css\n.parent {\n  display: grid;\n  place-items: center;\n}\n```', timestamp: '2024-01-15T10:30:05Z' },
      { role: 'user', content: 'What about using margin auto?', timestamp: '2024-01-15T10:31:00Z' },
      { role: 'assistant', content: 'Great question! `margin: auto` is indeed another method:\n\n```css\n.child {\n  margin: 0 auto;\n  width: 300px; /* width must be set */\n}\n```\n\nThis centers horizontally but not vertically. For both horizontal and vertical centering with margin auto, you need to combine it with absolute positioning.', timestamp: '2024-01-15T10:31:10Z' }
    ]
  },
  {
    id: '2',
    createdAt: '2024-01-16T14:15:00Z',
    annotation: 'wrong',
    metadata: {
      stage: 'feedback',
      task_id: 3635,
      user_id: 2504,
      type: 'learning_material',
      question_id: 7677,
      question_type: 'objective',
      question_purpose: 'exam',
      question_input_type: 'text',
      question_has_context: true,
      course: { id: 279, name: 'JavaScript' },
      milestone: { id: 902, name: 'DOM Manipulation Basics' },
      org: { id: 250, name: 'TechEd Institute' }
    },
    messages: [
      { role: 'user', content: 'What is the difference between let and var in JavaScript?', timestamp: '2024-01-16T14:15:00Z' },
      { role: 'assistant', content: 'The main differences between `let` and `var` are:\n\n1. **Scope**: `var` is function-scoped, `let` is block-scoped\n2. **Hoisting**: Both are hoisted, but `let` has temporal dead zone\n3. **Re-declaration**: `var` allows re-declaration, `let` does not\n\nExample:\n```javascript\nfunction example() {\n  if (true) {\n    var x = 1;\n    let y = 2;\n  }\n  console.log(x); // 1 (accessible)\n  console.log(y); // ReferenceError\n}\n```', timestamp: '2024-01-16T14:15:08Z' }
    ]
  },
  {
    id: '3',
    createdAt: '2024-01-17T09:45:00Z',
    annotation: null,
    metadata: {
      stage: 'query_rewrite',
      task_id: 3636,
      user_id: 2505,
      type: 'quiz',
      question_id: 7678,
      question_type: 'objective',
      question_purpose: 'practice',
      question_input_type: 'image',
      question_has_context: false,
      course: { id: 280, name: 'React' },
      milestone: { id: 903, name: 'Component Lifecycle' },
      org: { id: 249, name: 'Karka Academy' }
    },
    messages: [
      { role: 'user', content: 'Can you explain React useEffect hook?', timestamp: '2024-01-17T09:45:00Z' },
      { role: 'assistant', content: 'The `useEffect` hook lets you perform side effects in functional components. It serves the same purpose as `componentDidMount`, `componentDidUpdate`, and `componentWillUnmount` combined.\n\n**Basic syntax:**\n```javascript\nimport { useEffect, useState } from \'react\';\n\nfunction MyComponent() {\n  const [count, setCount] = useState(0);\n\n  useEffect(() => {\n    document.title = `Count: ${count}`;\n  }, [count]); // Dependency array\n\n  return <div>{count}</div>;\n}\n```', timestamp: '2024-01-17T09:45:12Z' },
      { role: 'user', content: 'When does useEffect run?', timestamp: '2024-01-17T09:46:00Z' },
      { role: 'assistant', content: 'useEffect runs at different times based on its dependency array:\n\n1. **No dependency array**: Runs after every render\n```javascript\nuseEffect(() => {\n  // Runs after every render\n});\n```\n\n2. **Empty dependency array**: Runs only once after initial render\n```javascript\nuseEffect(() => {\n  // Runs only once (like componentDidMount)\n}, []);\n```\n\n3. **With dependencies**: Runs when dependencies change\n```javascript\nuseEffect(() => {\n  // Runs when count changes\n}, [count]);\n```', timestamp: '2024-01-17T09:46:15Z' }
    ]
  }
];

interface Filters {
  org: string[];
  course: string[];
  milestone: string[];
  questionInputType: string[];
  questionPurpose: string[];
  questionType: string[];
  type: string[];
  stage: string[];
  annotation: 'all' | 'annotated' | 'unannotated' | 'correct' | 'wrong';
  startDate: string;
  endDate: string;
  timeFilter: 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom';
}

export default function Home() {
  // Authentication state - moved to top
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [selectedUsername, setSelectedUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [showProfileDropdown, setShowProfileDropdown] = useState(false);

  // Ref for profile dropdown
  const profileDropdownRef = useRef<HTMLDivElement>(null);

  // All other state hooks
  const [conversations, setConversations] = useState<Conversation[]>(dummyConversations);
  const [activeTab, setActiveTab] = useState<'runs' | 'queues'>('runs');
  const [annotationQueues, setAnnotationQueues] = useState<AnnotationQueue[]>([]);
  const [selectedQueue, setSelectedQueue] = useState<AnnotationQueue | null>(null);
  const [selectedRunInQueue, setSelectedRunInQueue] = useState<Conversation | null>(null);
  const [newQueueName, setNewQueueName] = useState('');
  const [showCreateQueueModal, setShowCreateQueueModal] = useState(false);
  const [showMetadata, setShowMetadata] = useState(false);
  const [showAnnotation, setShowAnnotation] = useState(true);
  const [currentAnnotation, setCurrentAnnotation] = useState<'correct' | 'wrong' | null>(null);
  const [annotationNotes, setAnnotationNotes] = useState('');

  // Track original values for change detection
  const [originalAnnotation, setOriginalAnnotation] = useState<'correct' | 'wrong' | null>(null);
  const [originalNotes, setOriginalNotes] = useState('');

  // Search states for filters
  const [orgSearch, setOrgSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [milestoneSearch, setMilestoneSearch] = useState('');

  const [filters, setFilters] = useState<Filters>({
    org: [],
    course: [],
    milestone: [],
    questionInputType: [],
    questionPurpose: [],
    questionType: [],
    type: [],
    stage: [],
    annotation: 'all',
    startDate: '',
    endDate: '',
    timeFilter: 'all'
  });

  // Load authentication state from localStorage on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('sensai-eval-user');
    if (savedUser) {
      setIsAuthenticated(true);
      setCurrentUser(savedUser);
    }
  }, []);

  // Handle click outside profile dropdown to close it
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setShowProfileDropdown(false);
      }
    };

    if (showProfileDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [showProfileDropdown]);

  // Get unique values for filter dropdowns - moved before conditional logic
  const filterOptions = useMemo(() => {
    const allOrgs = [...new Set(conversations.map(c => c.metadata.org.name))];

    // Filter courses based on selected organizations
    const availableCourses = filters.org.length === 0
      ? [...new Set(conversations.map(c => c.metadata.course.name))]
      : [...new Set(conversations
        .filter(c => filters.org.includes(c.metadata.org.name))
        .map(c => c.metadata.course.name))];

    // Filter milestones based on selected courses (or organizations if no courses selected)
    const availableMilestones = filters.course.length === 0 && filters.org.length === 0
      ? [...new Set(conversations.map(c => c.metadata.milestone.name))]
      : filters.course.length > 0
        ? [...new Set(conversations
          .filter(c => filters.course.includes(c.metadata.course.name))
          .map(c => c.metadata.milestone.name))]
        : [...new Set(conversations
          .filter(c => filters.org.includes(c.metadata.org.name))
          .map(c => c.metadata.milestone.name))];

    // Apply search filters
    const filteredOrgs = allOrgs.filter(org =>
      org.toLowerCase().includes(orgSearch.toLowerCase())
    );

    const filteredCourses = availableCourses.filter(course =>
      course.toLowerCase().includes(courseSearch.toLowerCase())
    );

    const filteredMilestones = availableMilestones.filter(milestone =>
      milestone.toLowerCase().includes(milestoneSearch.toLowerCase())
    );

    return {
      orgs: filteredOrgs,
      courses: filteredCourses,
      milestones: filteredMilestones,
      questionInputTypes: ['code', 'text', 'image'], // Limited to these three options
      questionPurposes: ['practice', 'exam'], // Limited to these two options
      questionTypes: ['objective', 'subjective'], // Limited to these two options
      types: ['quiz', 'learning_material'], // Limited to these two options as specified
      stages: [...new Set(conversations.map(c => c.metadata.stage))]
    };
  }, [conversations, filters.org, filters.course, orgSearch, courseSearch, milestoneSearch]);

  // Helper function to get date range based on time filter
  const getDateRangeForTimeFilter = (timeFilter: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    switch (timeFilter) {
      case 'today':
        return {
          start: today,
          end: new Date(today.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'yesterday':
        const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
        return {
          start: yesterday,
          end: new Date(yesterday.getTime() + 24 * 60 * 60 * 1000 - 1)
        };
      case 'last7days':
        return {
          start: new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000),
          end: now
        };
      case 'last30days':
        return {
          start: new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000),
          end: now
        };
      default:
        return null;
    }
  };

  // Filter conversations based on current filters
  const filteredConversations = useMemo(() => {
    return conversations.filter(conv => {
      // Existing filters
      const matchesBasicFilters = (
        (filters.org.length === 0 || filters.org.includes(conv.metadata.org.name)) &&
        (filters.course.length === 0 || filters.course.includes(conv.metadata.course.name)) &&
        (filters.milestone.length === 0 || filters.milestone.includes(conv.metadata.milestone.name)) &&
        (filters.questionInputType.length === 0 || filters.questionInputType.includes(conv.metadata.question_input_type)) &&
        (filters.questionPurpose.length === 0 || filters.questionPurpose.includes(conv.metadata.question_purpose)) &&
        (filters.questionType.length === 0 || filters.questionType.includes(conv.metadata.question_type)) &&
        (filters.type.length === 0 || filters.type.includes(conv.metadata.type)) &&
        (filters.stage.length === 0 || filters.stage.includes(conv.metadata.stage))
      );

      if (!matchesBasicFilters) return false;

      // Annotation filtering
      if (filters.annotation !== 'all') {
        switch (filters.annotation) {
          case 'annotated':
            if (conv.annotation === null || conv.annotation === undefined) return false;
            break;
          case 'unannotated':
            if (conv.annotation !== null && conv.annotation !== undefined) return false;
            break;
          case 'correct':
            if (conv.annotation !== 'correct') return false;
            break;
          case 'wrong':
            if (conv.annotation !== 'wrong') return false;
            break;
        }
      }

      // Time filtering
      const convDate = new Date(conv.createdAt);

      if (filters.timeFilter === 'custom') {
        // Custom date range
        if (filters.startDate && filters.endDate) {
          const startDate = new Date(filters.startDate);
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999); // End of day
          return convDate >= startDate && convDate <= endDate;
        } else if (filters.startDate) {
          const startDate = new Date(filters.startDate);
          return convDate >= startDate;
        } else if (filters.endDate) {
          const endDate = new Date(filters.endDate);
          endDate.setHours(23, 59, 59, 999);
          return convDate <= endDate;
        }
      } else if (filters.timeFilter !== 'all') {
        // Predefined time ranges
        const dateRange = getDateRangeForTimeFilter(filters.timeFilter);
        if (dateRange) {
          return convDate >= dateRange.start && convDate <= dateRange.end;
        }
      }

      return true;
    });
  }, [conversations, filters]);

  // Authentication handler
  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');

    if (!selectedUsername) {
      setAuthError('Please select a username');
      return;
    }

    if (password !== 'admin') {
      setAuthError('You need to enter the right password');
      return;
    }

    setIsAuthenticated(true);
    setCurrentUser(selectedUsername);
    localStorage.setItem('sensai-eval-user', selectedUsername); // Persist to localStorage
    setPassword(''); // Clear password for security
  };

  // If not authenticated, show login screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
          <h2 className="text-2xl font-bold text-center text-gray-800 mb-6">
            Authentication Required
          </h2>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Username
              </label>
              <select
                value={selectedUsername}
                onChange={(e) => setSelectedUsername(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 cursor-pointer"
                required
              >
                <option value="">Select username</option>
                <option value="Aman">Aman</option>
                <option value="Gayathri">Gayathri</option>
                <option value="Piyush">Piyush</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                required
              />
            </div>

            {authError && (
              <div className="text-red-600 text-sm text-center">
                {authError}
              </div>
            )}

            <button
              type="submit"
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer font-medium"
            >
              Login
            </button>
          </form>
        </div>
      </div>
    );
  }

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // For now, just show alert - would implement CSV parsing here
      alert(`File selected: ${file.name}. CSV parsing would be implemented here.`);
    }
  };

  const handleMultiFilterChange = (filterName: 'questionInputType' | 'questionPurpose' | 'questionType' | 'type' | 'stage' | 'org' | 'course' | 'milestone', value: string) => {
    setFilters(prev => {
      const currentValues = prev[filterName];
      const newValues = currentValues.includes(value)
        ? currentValues.filter(v => v !== value)
        : [...currentValues, value];

      // If changing organizations, clear courses and milestones that are no longer valid
      if (filterName === 'org') {
        const validCourses = conversations
          .filter(c => newValues.length === 0 || newValues.includes(c.metadata.org.name))
          .map(c => c.metadata.course.name);
        const filteredCourses = prev.course.filter(course => validCourses.includes(course));

        const validMilestones = conversations
          .filter(c => (newValues.length === 0 || newValues.includes(c.metadata.org.name)) &&
            (filteredCourses.length === 0 || filteredCourses.includes(c.metadata.course.name)))
          .map(c => c.metadata.milestone.name);
        const filteredMilestones = prev.milestone.filter(milestone => validMilestones.includes(milestone));

        return {
          ...prev,
          [filterName]: newValues,
          course: filteredCourses,
          milestone: filteredMilestones
        };
      }

      // If changing courses, clear milestones that are no longer valid
      if (filterName === 'course') {
        const validMilestones = conversations
          .filter(c => newValues.length === 0 || newValues.includes(c.metadata.course.name))
          .map(c => c.metadata.milestone.name);
        const filteredMilestones = prev.milestone.filter(milestone => validMilestones.includes(milestone));

        return {
          ...prev,
          [filterName]: newValues,
          milestone: filteredMilestones
        };
      }

      return { ...prev, [filterName]: newValues };
    });
  };

  const handleTimeFilterChange = (timeFilter: string) => {
    setFilters(prev => ({
      ...prev,
      timeFilter: timeFilter as 'all' | 'today' | 'yesterday' | 'last7days' | 'last30days' | 'custom',
      startDate: timeFilter === 'custom' ? prev.startDate : '',
      endDate: timeFilter === 'custom' ? prev.endDate : ''
    }));
  };

  const handleDateChange = (dateType: 'startDate' | 'endDate', value: string) => {
    setFilters(prev => ({ ...prev, [dateType]: value }));
  };

  const handleAnnotationFilterChange = (value: 'all' | 'annotated' | 'unannotated' | 'correct' | 'wrong') => {
    setFilters(prev => ({ ...prev, annotation: value }));
  };

  const clearFilters = () => {
    setFilters({
      org: [],
      course: [],
      milestone: [],
      questionInputType: [],
      questionPurpose: [],
      questionType: [],
      type: [],
      stage: [],
      annotation: 'all',
      startDate: '',
      endDate: '',
      timeFilter: 'all'
    });
    // Clear search filters as well
    setOrgSearch('');
    setCourseSearch('');
    setMilestoneSearch('');
  };

  const handleCreateQueue = () => {
    if (newQueueName.trim() && filteredConversations.length > 0) {
      const newQueue: AnnotationQueue = {
        id: `queue-${Date.now()}`,
        name: newQueueName.trim(),
        runs: [...filteredConversations],
        createdAt: new Date().toISOString()
      };
      setAnnotationQueues(prev => [...prev, newQueue]);
      setNewQueueName('');
      setShowCreateQueueModal(false);
      setActiveTab('queues');
    }
  };

  // Helper function for consistent date formatting
  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  };

  // Helper function to render annotation icon
  const renderAnnotationIcon = (annotation: 'correct' | 'wrong' | null | undefined) => {
    if (annotation === 'correct') {
      return (
        <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    } else if (annotation === 'wrong') {
      return (
        <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center">
          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
      );
    } else {
      return (
        <div className="w-5 h-5 rounded-full border-2 border-gray-300 bg-white"></div>
      );
    }
  };

  // Helper function to get current run index in queue
  const getCurrentRunIndex = () => {
    if (!selectedQueue || !selectedRunInQueue) return -1;
    return selectedQueue.runs.findIndex(run => run.id === selectedRunInQueue.id);
  };

  // Navigation functions
  const goToNextRun = () => {
    if (!selectedQueue || !selectedRunInQueue) return;
    const currentIndex = getCurrentRunIndex();
    if (currentIndex < selectedQueue.runs.length - 1) {
      const nextRun = selectedQueue.runs[currentIndex + 1];
      setSelectedRunInQueue(nextRun);
      setCurrentAnnotation(nextRun.annotation || null);
      setAnnotationNotes(''); // Reset notes for new run
    }
  };

  const goToPreviousRun = () => {
    if (!selectedQueue || !selectedRunInQueue) return;
    const currentIndex = getCurrentRunIndex();
    if (currentIndex > 0) {
      const prevRun = selectedQueue.runs[currentIndex - 1];
      setSelectedRunInQueue(prevRun);
      setCurrentAnnotation(prevRun.annotation || null);
      setAnnotationNotes(''); // Reset notes for new run
    }
  };

  // Update annotation function
  const handleUpdateAnnotation = () => {
    if (!selectedQueue || !selectedRunInQueue) return;

    // Update the run in the queue
    const updatedRuns = selectedQueue.runs.map(run =>
      run.id === selectedRunInQueue.id
        ? { ...run, annotation: currentAnnotation }
        : run
    );

    // Update the queue
    const updatedQueues = annotationQueues.map(queue =>
      queue.id === selectedQueue.id
        ? { ...queue, runs: updatedRuns }
        : queue
    );

    setAnnotationQueues(updatedQueues);
    setSelectedQueue({ ...selectedQueue, runs: updatedRuns });

    // Update the selected run
    const updatedRun = { ...selectedRunInQueue, annotation: currentAnnotation };
    setSelectedRunInQueue(updatedRun);

    // Also update in main conversations if needed
    const updatedConversations = conversations.map(conv =>
      conv.id === selectedRunInQueue.id
        ? { ...conv, annotation: currentAnnotation }
        : conv
    );
    setConversations(updatedConversations);

    // Reset original values to current values after successful update
    setOriginalAnnotation(currentAnnotation);
    setOriginalNotes(annotationNotes.trim());

    alert('Annotation updated successfully!');
  };

  // Initialize annotation state when selecting a run
  const handleRunSelection = (run: Conversation) => {
    setSelectedRunInQueue(run);
    setCurrentAnnotation(run.annotation || null);
    setAnnotationNotes('');

    // Store original values for change detection
    setOriginalAnnotation(run.annotation || null);
    setOriginalNotes(''); // Notes are always reset to empty when selecting a run
  };

  // Check if annotation or notes have been changed
  const hasAnnotationChanges = () => {
    const annotationChanged = currentAnnotation !== originalAnnotation;
    const notesChanged = annotationNotes.trim() !== originalNotes.trim();
    return annotationChanged || notesChanged;
  };

  // Logout handler
  const handleLogout = () => {
    setIsAuthenticated(false);
    setCurrentUser('');
    setSelectedUsername('');
    setPassword('');
    setAuthError('');
    setShowProfileDropdown(false);
    localStorage.removeItem('sensai-eval-user'); // Clear from localStorage
  };

  // Get initials for profile circle
  const getUserInitials = (name: string) => {
    return name.charAt(0).toUpperCase();
  };

  const renderRunsTab = () => (
    <div className="flex gap-6 h-full">
      {/* Left Side - Filters (50%) */}
      <div className="w-[50%] h-full">
        {/* Filters */}
        <div className="h-full flex flex-col">
          <div className="flex justify-between items-center mb-4 flex-shrink-0">
            <h2 className="text-lg font-semibold text-gray-800">Filters</h2>
            <button
              onClick={clearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              Clear All
            </button>
          </div>

          <div className="space-y-8 overflow-y-auto flex-1 min-h-0 pb-4">
            {/* Annotation Filter - All options in one row */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Annotation
              </label>
              <div className="flex flex-wrap gap-4">
                {['all', 'annotated', 'unannotated', 'correct', 'wrong'].map(annotation => (
                  <label key={annotation} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="annotation"
                      value={annotation}
                      checked={filters.annotation === annotation}
                      onChange={() => handleAnnotationFilterChange(annotation as 'all' | 'annotated' | 'unannotated' | 'correct' | 'wrong')}
                      className="mr-2 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700 capitalize">{annotation}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Time Filter - All options in one row */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Time Range
              </label>
              <div className="flex flex-wrap gap-4">
                {[
                  { value: 'all', label: 'All Time' },
                  { value: 'today', label: 'Today' },
                  { value: 'yesterday', label: 'Yesterday' },
                  { value: 'last7days', label: 'Last 7 Days' },
                  { value: 'last30days', label: 'Last 30 Days' },
                  { value: 'custom', label: 'Custom Range' }
                ].map(option => (
                  <label key={option.value} className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="timeFilter"
                      value={option.value}
                      checked={filters.timeFilter === option.value}
                      onChange={(e) => handleTimeFilterChange(e.target.value)}
                      className="mr-2 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">{option.label}</span>
                  </label>
                ))}
              </div>

              {/* Custom Date Range */}
              {filters.timeFilter === 'custom' && (
                <div className="mt-3 grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Start Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={filters.startDate}
                      onChange={(e) => handleDateChange('startDate', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      End Date & Time
                    </label>
                    <input
                      type="datetime-local"
                      value={filters.endDate}
                      onChange={(e) => handleDateChange('endDate', e.target.value)}
                      className="w-full px-2 py-1 text-sm border border-gray-300 rounded-md cursor-pointer"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Row 2: Type, Question Type, Purpose - 3 columns with horizontal options */}
            <div className="grid grid-cols-3 gap-8">
              {/* Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Type
                </label>
                <div className="flex flex-wrap gap-4">
                  {filterOptions.types.map(type => (
                    <label key={type} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.type.includes(type)}
                        onChange={() => handleMultiFilterChange('type', type)}
                        className="mr-2 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Question Type */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Question Type
                </label>
                <div className="flex flex-wrap gap-4">
                  {filterOptions.questionTypes.map(type => (
                    <label key={type} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.questionType.includes(type)}
                        onChange={() => handleMultiFilterChange('questionType', type)}
                        className="mr-2 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Purpose */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Purpose
                </label>
                <div className="flex flex-wrap gap-4">
                  {filterOptions.questionPurposes.map(purpose => (
                    <label key={purpose} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.questionPurpose.includes(purpose)}
                        onChange={() => handleMultiFilterChange('questionPurpose', purpose)}
                        className="mr-2 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{purpose}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Row 3: Input Types and Stage - Stage spans 2 columns */}
            <div className="grid grid-cols-3 gap-8">
              {/* Input Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Input Types
                </label>
                <div className="flex flex-wrap gap-4">
                  {filterOptions.questionInputTypes.map(type => (
                    <label key={type} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.questionInputType.includes(type)}
                        onChange={() => handleMultiFilterChange('questionInputType', type)}
                        className="mr-2 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{type}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Stage - spans 2 columns */}
              <div className="col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Stage
                </label>
                <div className="flex flex-wrap gap-4">
                  {filterOptions.stages.map(stage => (
                    <label key={stage} className="flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.stage.includes(stage)}
                        onChange={() => handleMultiFilterChange('stage', stage)}
                        className="mr-2 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{stage}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {/* Organizations */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Organizations ({filters.org.length > 0 ? filters.org.length : 'All'})
              </label>
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Search organizations"
                  value={orgSearch}
                  onChange={(e) => setOrgSearch(e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-24 overflow-y-auto border border-gray-300 rounded-md bg-white">
                {filterOptions.orgs.length > 0 ? (
                  filterOptions.orgs.map(org => (
                    <label key={org} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.org.includes(org)}
                        onChange={() => handleMultiFilterChange('org', org)}
                        className="mr-3 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{org}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">
                    {orgSearch ? `No organizations found matching "${orgSearch}"` : 'No organizations available'}
                  </div>
                )}
              </div>
            </div>

            {/* Courses */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Courses ({filters.course.length > 0 ? filters.course.length : 'All'})
                {filters.org.length > 0 && (
                  <span className="text-xs text-gray-500 ml-1">
                    (filtered by {filters.org.length} org{filters.org.length > 1 ? 's' : ''})
                  </span>
                )}
              </label>
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Search courses"
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-24 overflow-y-auto border border-gray-300 rounded-md bg-white">
                {filterOptions.courses.length > 0 ? (
                  filterOptions.courses.map(course => (
                    <label key={course} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.course.includes(course)}
                        onChange={() => handleMultiFilterChange('course', course)}
                        className="mr-3 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{course}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">
                    {courseSearch ? `No courses found matching "${courseSearch}"` :
                      filters.org.length > 0 ? 'No courses available for selected organizations' : 'No courses available'}
                  </div>
                )}
              </div>
            </div>

            {/* Milestones */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Milestones ({filters.milestone.length > 0 ? filters.milestone.length : 'All'})
                {(filters.org.length > 0 || filters.course.length > 0) && (
                  <span className="text-xs text-gray-500 ml-1">
                    (filtered by {filters.course.length > 0 ? `${filters.course.length} course${filters.course.length > 1 ? 's' : ''}` : `${filters.org.length} org${filters.org.length > 1 ? 's' : ''}`})
                  </span>
                )}
              </label>
              <div className="mb-2">
                <input
                  type="text"
                  placeholder="Search milestones"
                  value={milestoneSearch}
                  onChange={(e) => setMilestoneSearch(e.target.value)}
                  className="w-full px-3 py-1 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="max-h-24 overflow-y-auto border border-gray-300 rounded-md bg-white">
                {filterOptions.milestones.length > 0 ? (
                  filterOptions.milestones.map(milestone => (
                    <label key={milestone} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={filters.milestone.includes(milestone)}
                        onChange={() => handleMultiFilterChange('milestone', milestone)}
                        className="mr-3 cursor-pointer"
                      />
                      <span className="text-sm text-gray-700">{milestone}</span>
                    </label>
                  ))
                ) : (
                  <div className="px-3 py-2 text-sm text-gray-500 italic">
                    {milestoneSearch ? `No milestones found matching "${milestoneSearch}"` :
                      filters.course.length > 0 ? 'No milestones available for selected courses' :
                        filters.org.length > 0 ? 'No milestones available for selected organizations' : 'No milestones available'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Side - Filtered Results (50%) */}
      <div className="w-[50%] bg-white rounded-lg shadow-sm border flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800">
            Filtered Runs ({filteredConversations.length})
          </h2>
          {filteredConversations.length > 0 && (
            <button
              onClick={() => setShowCreateQueueModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
            >
              Create Annotation Queue
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto divide-y">
          {filteredConversations.map(conv => (
            <div key={conv.id} className="p-4">
              <div className="space-y-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-3">
                    {renderAnnotationIcon(conv.annotation)}
                    <div className="text-sm font-medium text-gray-900">
                      org_{conv.metadata.org.name}_task_{conv.metadata.task_id}_user_{conv.metadata.user_id}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDate(conv.createdAt)}
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span className={`px-2 py-1 text-xs rounded-full ${conv.metadata.stage === 'router' ? 'bg-green-100 text-green-800' :
                    conv.metadata.stage === 'feedback' ? 'bg-blue-100 text-blue-800' :
                      'bg-yellow-100 text-yellow-800'
                    }`}>
                    {conv.metadata.stage}
                  </span>

                  <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                    {conv.metadata.question_input_type}
                  </span>

                  <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">
                    {conv.metadata.question_type}
                  </span>

                  <span className="px-2 py-1 text-xs rounded-full bg-pink-100 text-pink-800">
                    {conv.metadata.type}
                  </span>

                  <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                    {conv.metadata.question_purpose}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Queue Modal */}
      {showCreateQueueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create Annotation Queue</h3>
            <p className="text-sm text-gray-600 mb-4">
              Create a new annotation queue with {filteredConversations.length} filtered runs.
            </p>
            <input
              type="text"
              value={newQueueName}
              onChange={(e) => setNewQueueName(e.target.value)}
              placeholder="Enter queue name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md mb-4"
              autoFocus
            />
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowCreateQueueModal(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQueue}
                disabled={!newQueueName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer"
              >
                Create Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderQueuesTab = () => (
    <div className="flex gap-4 h-full">
      {/* Queue List or Tasks in Selected Queue - 20% */}
      <div className="w-1/5 bg-white rounded-lg shadow-sm border overflow-y-auto flex flex-col">
        {!selectedQueue ? (
          // Show Queue List
          <>
            <div className="p-4 border-b flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-800">
                Annotation Queues ({annotationQueues.length})
              </h2>
            </div>

            {annotationQueues.length > 0 ? (
              <div className="divide-y flex-1 overflow-y-auto">
                {annotationQueues.map(queue => (
                  <div
                    key={queue.id}
                    onClick={() => {
                      setSelectedQueue(queue);
                      setSelectedRunInQueue(null);
                    }}
                    className="p-3 cursor-pointer hover:bg-gray-50 flex items-center justify-between"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-gray-900 text-sm truncate">
                        {queue.name} ({queue.runs.length})
                      </div>
                      <div className="text-xs text-gray-500">
                        Created: {formatDate(queue.createdAt)}
                      </div>
                    </div>
                    <div className="ml-2 text-gray-400">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center text-gray-500">
                  <div className="text-sm font-medium mb-2">No Annotation Queues</div>
                  <div className="text-xs">Create queues from the Runs tab to get started</div>
                </div>
              </div>
            )}
          </>
        ) : (
          // Show Tasks in Selected Queue
          <>
            <div className="p-4 border-b flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-800">
                  {selectedQueue.name} ({selectedQueue.runs.length})
                </h3>
                <button
                  onClick={() => {
                    setSelectedQueue(null);
                    setSelectedRunInQueue(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 cursor-pointer"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="divide-y flex-1 overflow-y-auto">
              {selectedQueue.runs.map(run => (
                <div
                  key={run.id}
                  onClick={() => handleRunSelection(run)}
                  className={`p-3 cursor-pointer hover:bg-gray-50 ${selectedRunInQueue?.id === run.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                    }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {renderAnnotationIcon(run.annotation)}
                      <div className="text-xs font-medium text-gray-900 flex-1 min-w-0">
                        org_{run.metadata.org.name}_task_{run.metadata.task_id}_user_{run.metadata.user_id}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(run.createdAt)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Queue Content - 80% */}
      {annotationQueues.length === 0 ? (
        // Show full-width placeholder when no queues exist
        <div className="w-4/5 bg-white rounded-lg shadow-sm border flex items-center justify-center">
          <div className="text-center text-gray-500 p-8">
            <div className="text-xl font-medium mb-3">No Annotation Queues Created</div>
            <div className="text-sm mb-4">You haven&apos;t created any annotation queues yet.</div>
            <div className="text-sm text-gray-400">Go to the Runs tab, apply filters, and create your first annotation queue to get started.</div>
          </div>
        </div>
      ) : selectedQueue ? (
        <div className="w-4/5 flex gap-4">
          {/* Run Detail - Full width when queue is selected */}
          {selectedRunInQueue && (
            <div className="w-full bg-white rounded-lg shadow-sm border flex flex-col">
              <div className="flex h-full">
                {/* Chat History - Adjust width based on what's showing */}
                <div className={`${(showMetadata || showAnnotation) ? 'w-3/5' : 'w-full'} flex flex-col`}>
                  <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                    <h3 className="text-lg font-semibold text-gray-800">
                      org_{selectedRunInQueue.metadata.org.name}_task_{selectedRunInQueue.metadata.task_id}_user_{selectedRunInQueue.metadata.user_id}
                    </h3>
                    <div className="flex gap-4">
                      <button
                        onClick={() => {
                          setShowAnnotation(!showAnnotation);
                          if (!showAnnotation) setShowMetadata(false);
                        }}
                        className={`px-4 py-2 text-sm rounded-md cursor-pointer flex items-center gap-2 ${showAnnotation
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                        {(!showAnnotation && !showMetadata) && 'Annotation'}
                      </button>
                      <button
                        onClick={() => {
                          setShowMetadata(!showMetadata);
                          if (!showMetadata) setShowAnnotation(false);
                        }}
                        className={`px-4 py-2 text-sm rounded-md cursor-pointer flex items-center gap-2 ${showMetadata
                          ? 'bg-blue-500 hover:bg-blue-600 text-white'
                          : 'bg-gray-200 hover:bg-gray-300 text-gray-700'
                          }`}
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        {(!showAnnotation && !showMetadata) && 'Metadata'}
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {selectedRunInQueue.messages.map((message, index) => (
                      <div
                        key={index}
                        className={`flex ${message.role === 'user' ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`${(showMetadata || showAnnotation) ? 'max-w-2xl' : 'max-w-4xl'} p-3 rounded-lg ${message.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-gray-100 text-gray-800'
                            }`}
                        >
                          <div className="text-sm font-medium mb-1">
                            {message.role === 'user' ? 'User' : 'Assistant'}
                          </div>
                          <div className="whitespace-pre-wrap">{message.content}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Right Panel - Show Annotation or Metadata based on state */}
                {(showAnnotation || showMetadata) && (
                  <div className="w-2/5 border-l bg-gray-50 overflow-y-auto">
                    {showAnnotation && (
                      <>
                        <div className="p-4 border-b">
                          <h4 className="text-sm font-semibold text-gray-800">Annotation</h4>
                        </div>

                        <div className="p-4 space-y-4">
                          {/* Annotation Buttons */}
                          <div>
                            <div className="text-xs font-medium text-gray-600 mb-2">Judgement</div>
                            <div className="flex gap-4">
                              <button
                                onClick={() => setCurrentAnnotation('correct')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer ${currentAnnotation === 'correct'
                                  ? 'bg-green-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-green-100'
                                  }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                                Correct
                              </button>
                              <button
                                onClick={() => setCurrentAnnotation('wrong')}
                                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium cursor-pointer ${currentAnnotation === 'wrong'
                                  ? 'bg-red-500 text-white'
                                  : 'bg-gray-100 text-gray-700 hover:bg-red-100'
                                  }`}
                              >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Wrong
                              </button>
                            </div>
                          </div>

                          {/* Notes Text Area */}
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-2">
                              Notes
                            </label>
                            <textarea
                              value={annotationNotes}
                              onChange={(e) => setAnnotationNotes(e.target.value)}
                              placeholder="Add details about the annotation"
                              className="w-full h-24 px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                            />
                          </div>

                          {/* Update Button */}
                          <button
                            onClick={handleUpdateAnnotation}
                            disabled={!currentAnnotation || !hasAnnotationChanges()}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium cursor-pointer"
                          >
                            Update Annotation
                          </button>

                          {/* Navigation Buttons */}
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={goToPreviousRun}
                              disabled={getCurrentRunIndex() <= 0}
                              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium cursor-pointer"
                            >
                              ← Previous
                            </button>
                            <button
                              onClick={goToNextRun}
                              disabled={!selectedQueue || getCurrentRunIndex() >= selectedQueue.runs.length - 1}
                              className="flex-1 px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed text-sm font-medium cursor-pointer"
                            >
                              Next →
                            </button>
                          </div>

                          {/* Progress indicator */}
                          <div className="text-xs text-gray-500 text-center pt-2">
                            {getCurrentRunIndex() + 1} of {selectedQueue?.runs.length || 0}
                          </div>
                        </div>
                      </>
                    )}

                    {showMetadata && (
                      <>
                        <div className="p-4 border-b">
                          <h4 className="text-sm font-semibold text-gray-800">Metadata</h4>
                        </div>

                        <div className="p-4 space-y-3 text-xs">
                          <div>
                            <div className="font-medium text-gray-600">Stage</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.stage}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Type</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.type}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">User ID</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.user_id}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Question ID</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.question_id}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Question Type</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.question_type}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Purpose</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.question_purpose}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Input Type</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.question_input_type}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Has Context</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.question_has_context ? 'Yes' : 'No'}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Organization</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.org.name}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Course</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.course.name}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Milestone</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.milestone.name}</div>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* No Run Selected in Queue */}
          {!selectedRunInQueue && (
            <div className="w-full bg-white rounded-lg shadow-sm border flex items-center justify-center">
              <div className="text-center text-gray-500">
                <div className="text-lg font-medium mb-2">No Task Selected</div>
                <div className="text-sm">Select a task from the queue to view its details</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // No Queue Selected
        <div className="w-4/5 bg-white rounded-lg shadow-sm border flex items-center justify-center">
          <div className="text-center text-gray-500 p-8">
            <div className="text-lg font-medium mb-2">No Queue Selected</div>
            <div className="text-sm">Select an annotation queue from the list to view and annotate its tasks</div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-8">

            {/* Tabs */}
            <nav className="flex space-x-8">
              <button
                onClick={() => setActiveTab('runs')}
                className={`py-2 px-1 border-b-2 font-medium text-sm cursor-pointer ${activeTab === 'runs'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Runs
              </button>
              <button
                onClick={() => setActiveTab('queues')}
                className={`py-2 px-1 border-b-2 font-medium text-sm cursor-pointer ${activeTab === 'queues'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                Annotation Queues ({annotationQueues.length})
              </button>
            </nav>
          </div>

          {/* Right side - CSV Upload and Profile */}
          <div className="flex items-center gap-4">
            {/* CSV Upload */}
            <label className="cursor-pointer">
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <div className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border text-sm font-medium cursor-pointer">
                Upload CSV
              </div>
            </label>

            {/* Profile Dropdown */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                onClick={() => setShowProfileDropdown(!showProfileDropdown)}
                className="w-10 h-10 rounded-full bg-blue-600 text-white flex items-center justify-center font-medium hover:bg-blue-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                {getUserInitials(currentUser)}
              </button>

              {/* Dropdown Menu */}
              {showProfileDropdown && (
                <div className="absolute right-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <div className="text-sm font-medium text-gray-900">{currentUser}</div>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tab Content */}
      <div className="h-[calc(100vh-120px)]">
        {activeTab === 'runs' ? renderRunsTab() : renderQueuesTab()}
      </div>
    </div>
  );
}
