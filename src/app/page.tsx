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
  uploaded_by?: string;
  context?: string;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
  context?: string;
}

interface UserAnnotation {
  judgement: 'correct' | 'wrong';
  notes: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  metadata: Metadata;
  messages: ChatMessage[];
  createdAt?: string;
  start_time?: string;
  end_time?: string;
  annotations?: { [username: string]: UserAnnotation };
  uploaded_by?: string;
  // New trace and span fields
  span_id?: string;
  trace_id?: string;
  span_kind?: string;
  span_name?: string;
  model_name?: string;
  // Context field for displaying context information
  context?: string;
}

interface ScorecardCriterionFeedback {
  correct?: string;
  wrong?: string;
}

interface ScorecardCriterion {
  category: string;
  pass_score: number;
  score: number;
  max_score: number;
  feedback: ScorecardCriterionFeedback

}

interface AnnotationQueue {
  id: string;
  name: string;
  runs: Conversation[];
  createdAt: string;
  created_by?: string;
}

// Add Toast interface
interface Toast {
  id: string;
  type: 'success' | 'error' | 'warning';
  message: string;
  duration?: number;
}

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

  // Toast state
  const [toasts, setToasts] = useState<Toast[]>([]);

  // All other state hooks - Updated to start with empty arrays and load from API
  const [conversations, setConversations] = useState<Conversation[]>([]);
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
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingQueue, setIsCreatingQueue] = useState(false);
  const [isUpdatingAnnotation, setIsUpdatingAnnotation] = useState(false);
  const [sortBy] = useState<'timestamp' | 'org' | 'task_id'>('timestamp');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [queueSortBy, setQueueSortBy] = useState<'timestamp' | 'org' | 'task_id'>('timestamp');
  const [queueSortOrder, setQueueSortOrder] = useState<'asc' | 'desc'>('desc');

  // Add state for selected annotator for viewing annotations
  const [selectedAnnotatorForViewing, setSelectedAnnotatorForViewing] = useState<string>('');

  // Track original values for change detection
  const [originalAnnotation, setOriginalAnnotation] = useState<'correct' | 'wrong' | null>(null);
  const [originalNotes, setOriginalNotes] = useState('');

  // Search states for filters
  const [orgSearch, setOrgSearch] = useState('');
  const [courseSearch, setCourseSearch] = useState('');
  const [milestoneSearch, setMilestoneSearch] = useState('');

  // State for AI message tabs
  const [activeAITab, setActiveAITab] = useState<{ [messageIndex: number]: 'feedback' | 'analysis' | 'scorecard' }>({});

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

  // Progress tracking for CSV upload
  const [uploadProgress, setUploadProgress] = useState({
    show: false,
    phase: 'Reading file...',
    percentage: 0
  });

  // Load authentication state from localStorage on component mount
  useEffect(() => {
    const savedUser = localStorage.getItem('sensai-eval-user');
    if (savedUser) {
      setIsAuthenticated(true);
      setCurrentUser(savedUser);
    }
  }, []);

  // Load data from API when authenticated
  useEffect(() => {
    const loadData = async () => {
      if (!isAuthenticated) return;

      try {
        setIsLoading(true);
        const [conversationsRes, queuesRes] = await Promise.all([
          fetch('/api/conversations'),
          fetch('/api/queues')
        ]);

        const conversations = await conversationsRes.json();
        const queues = await queuesRes.json();

        setConversations(conversations);
        setAnnotationQueues(queues);
      } catch (error) {
        console.error('Error loading data:', error);
        // No fallback to dummy data - keep empty arrays
        setConversations([]);
        setAnnotationQueues([]);
      } finally {
        setIsLoading(false);
      }
    };

    loadData();
  }, [isAuthenticated]);

  // Reset selected annotator when queue changes
  useEffect(() => {
    if (selectedQueue) {
      const annotators = getQueueAnnotators();
      if (annotators.length > 0) {
        // Default to current user if they have annotations, otherwise first annotator
        const defaultAnnotator = annotators.includes(currentUser) ? currentUser : annotators[0];
        setSelectedAnnotatorForViewing(defaultAnnotator);
      } else {
        setSelectedAnnotatorForViewing('');
      }
    } else {
      setSelectedAnnotatorForViewing('');
    }
  }, [selectedQueue?.id, currentUser]);

  // Save conversations to API
  const saveConversations = async (newConversations: Conversation[]) => {
    try {
      await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newConversations)
      });
    } catch (error) {
      console.error('Error saving conversations:', error);
    }
  };

  // Save queues to API
  const saveQueues = async (newQueues: AnnotationQueue[]) => {
    try {
      await fetch('/api/queues', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newQueues)
      });
    } catch (error) {
      console.error('Error saving queues:', error);
    }
  };

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

  // Get unique values for filter dropdowns - handle null values properly
  const filterOptions = useMemo(() => {
    const allOrgs = [...new Set(conversations.map(c => c.metadata.org?.name).filter(Boolean))];

    // Filter courses based on selected organizations
    const availableCourses = filters.org.length === 0
      ? [...new Set(conversations.map(c => c.metadata.course?.name).filter(Boolean))]
      : [...new Set(conversations
        .filter(c => c.metadata.org?.name && filters.org.includes(c.metadata.org.name))
        .map(c => c.metadata.course?.name).filter(Boolean))];

    // Filter milestones based on selected courses (or organizations if no courses selected)
    const availableMilestones = filters.course.length === 0 && filters.org.length === 0
      ? [...new Set(conversations.map(c => c.metadata.milestone?.name).filter(Boolean))]
      : filters.course.length > 0
        ? [...new Set(conversations
          .filter(c => c.metadata.course?.name && filters.course.includes(c.metadata.course.name))
          .map(c => c.metadata.milestone?.name).filter(Boolean))]
        : [...new Set(conversations
          .filter(c => c.metadata.org?.name && filters.org.includes(c.metadata.org.name))
          .map(c => c.metadata.milestone?.name).filter(Boolean))];

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
      questionInputTypes: [...new Set(conversations.map(c => c.metadata.question_input_type).filter(Boolean))],
      questionPurposes: [...new Set(conversations.map(c => c.metadata.question_purpose).filter(Boolean))],
      questionTypes: [...new Set(conversations.map(c => c.metadata.question_type).filter(Boolean))],
      types: [...new Set(conversations.map(c => c.metadata.type).filter(Boolean))],
      stages: ['router', 'query_rewrite', 'feedback']
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

  // Helper function for consistent date formatting - use end_time if available, fallback to createdAt
  const formatDate = (conversation: Conversation) => {
    const dateString = conversation.end_time || conversation.createdAt;
    if (!dateString) return 'No date';

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

  // Helper function to get display timestamp for sorting
  const getDisplayTimestamp = (conversation: Conversation) => {
    return conversation.end_time || conversation.createdAt || '';
  };

  // Compute filtered conversations based on current filters
  const filteredConversations = useMemo(() => {
    let filtered = conversations;

    // Apply date filters
    if (filters.timeFilter !== 'all') {
      const dateRange = getDateRangeForTimeFilter(filters.timeFilter);
      if (dateRange) {
        filtered = filtered.filter(conv => {
          const convDate = new Date(conv.start_time || conv.createdAt || 0);
          return convDate >= dateRange.start && convDate <= dateRange.end;
        });
      }
    }

    // Apply custom date range if specified
    if (filters.timeFilter === 'custom' && filters.startDate && filters.endDate) {
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      endDate.setHours(23, 59, 59, 999); // Include the entire end date

      filtered = filtered.filter(conv => {
        const convDate = new Date(conv.start_time || conv.createdAt || 0);
        return convDate >= startDate && convDate <= endDate;
      });
    }

    // Apply other filters
    if (filters.org.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.org?.name && filters.org.includes(conv.metadata.org.name)
      );
    }

    if (filters.course.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.course?.name && filters.course.includes(conv.metadata.course.name)
      );
    }

    if (filters.milestone.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.milestone?.name && filters.milestone.includes(conv.metadata.milestone.name)
      );
    }

    if (filters.questionInputType.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.question_input_type && filters.questionInputType.includes(conv.metadata.question_input_type)
      );
    }

    if (filters.questionPurpose.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.question_purpose && filters.questionPurpose.includes(conv.metadata.question_purpose)
      );
    }

    if (filters.questionType.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.question_type && filters.questionType.includes(conv.metadata.question_type)
      );
    }

    if (filters.type.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.type && filters.type.includes(conv.metadata.type)
      );
    }

    if (filters.stage.length > 0) {
      filtered = filtered.filter(conv =>
        conv.metadata.stage && filters.stage.includes(conv.metadata.stage)
      );
    }

    // Apply annotation filter
    if (filters.annotation !== 'all') {
      filtered = filtered.filter(conv => {
        const userAnnotation = conv.annotations?.[currentUser];

        switch (filters.annotation) {
          case 'annotated':
            return userAnnotation !== undefined;
          case 'unannotated':
            return userAnnotation === undefined;
          case 'correct':
            return userAnnotation?.judgement === 'correct';
          case 'wrong':
            return userAnnotation?.judgement === 'wrong';
          default:
            return true;
        }
      });
    }

    // Apply sorting
    return filtered.sort((a, b) => {
      let comparison = 0;

      switch (sortBy) {
        case 'timestamp':
          const aTime = new Date(a.start_time || a.createdAt || 0).getTime();
          const bTime = new Date(b.start_time || b.createdAt || 0).getTime();
          comparison = aTime - bTime;
          break;
        case 'org':
          const aOrg = a.metadata.org?.name || '';
          const bOrg = b.metadata.org?.name || '';
          comparison = aOrg.localeCompare(bOrg);
          break;
        case 'task_id':
          comparison = (a.metadata.task_id || 0) - (b.metadata.task_id || 0);
          break;
      }

      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }, [conversations, filters, sortBy, sortOrder, currentUser]);

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

  // Add toast functions
  const addToast = (type: 'success' | 'error' | 'warning', message: string, duration = 5000) => {
    const id = `toast-${Date.now()}-${Math.random()}`;
    const newToast: Toast = { id, type, message, duration };

    setToasts(prev => [...prev, newToast]);

    // Auto remove toast after duration
    setTimeout(() => {
      removeToast(id);
    }, duration);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    console.log(1)
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      addToast('error', 'Please select a CSV file');
      return;
    }

    console.log(2)

    try {
      setIsUploading(true);
      setUploadProgress({
        show: true,
        phase: 'Reading CSV file...',
        percentage: 5
      });

      console.log(3)

      // Read the entire file as text
      const fileText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => resolve(e.target?.result as string);
        reader.onerror = (e) => {
          console.log(e)
          reject(e);
        }
        reader.readAsText(file);
      });

      console.log(4)

      setUploadProgress({
        show: true,
        phase: 'Preparing data for upload...',
        percentage: 10
      });

      // Split the CSV into lines
      const lines = fileText.split('\n').filter(line => line.trim());
      if (lines.length === 0) {
        addToast('error', 'CSV file appears to be empty');
        return;
      }

      console.log(4)

      // Extract header
      const header = lines[0];
      const dataLines = lines.slice(1);

      if (dataLines.length === 0) {
        addToast('error', 'CSV file has no data rows');
        return;
      }

      // Define chunk size (number of rows per chunk)
      const CHUNK_SIZE = 100; // Adjust this based on your needs
      const totalChunks = Math.ceil(dataLines.length / CHUNK_SIZE);

      setUploadProgress({
        show: true,
        phase: `Processing ${totalChunks} chunks...`,
        percentage: 15
      });

      let processedCount = 0;
      let totalNewConversations = 0;
      let totalDuplicates = 0;
      let hasErrors = false;
      let errorMessage = '';

      console.log(totalChunks)

      // Process chunks sequentially to avoid overwhelming the server
      for (let i = 0; i < totalChunks; i++) {
        const startIdx = i * CHUNK_SIZE;
        const endIdx = Math.min(startIdx + CHUNK_SIZE, dataLines.length);
        const chunkLines = dataLines.slice(startIdx, endIdx);

        // Create CSV chunk with header
        const chunkCsv = [header, ...chunkLines].join('\n');

        setUploadProgress({
          show: true,
          phase: `Processing chunk ${i + 1} of ${totalChunks}...`,
          percentage: 15 + Math.floor((i / totalChunks) * 70)
        });

        try {
          // Create form data for this chunk
          const chunkBlob = new Blob([chunkCsv], { type: 'text/csv' });
          const formData = new FormData();
          formData.append('file', chunkBlob, `chunk_${i + 1}.csv`);
          formData.append('uploadedBy', currentUser);
          formData.append('isChunk', 'true');
          formData.append('chunkNumber', (i + 1).toString());
          formData.append('totalChunks', totalChunks.toString());

          const response = await fetch('/api/upload-csv', {
            method: 'POST',
            body: formData
          });

          const result = await response.json();

          if (response.ok) {
            totalNewConversations += result.newCount || 0;
            totalDuplicates += result.duplicateCount || 0;
            processedCount++;
          } else {
            hasErrors = true;
            errorMessage = result.error || `Error processing chunk ${i + 1}`;
            console.error(`Error processing chunk ${i + 1}:`, result.error);

            // Continue processing other chunks even if one fails
            // but track that there were errors
          }

          // Small delay between chunks to avoid overwhelming the server
          if (i < totalChunks - 1) {
            await new Promise(resolve => setTimeout(resolve, 100));
          }

        } catch (error) {
          console.error(`Error uploading chunk ${i + 1}:`, error);
          hasErrors = true;
          errorMessage = `Network error processing chunk ${i + 1}`;
          // Continue with other chunks
        }
      }

      setUploadProgress({
        show: true,
        phase: 'Finalizing upload...',
        percentage: 90
      });

      // Provide final feedback based on results
      if (hasErrors && processedCount === 0) {
        addToast('error', `Upload failed: ${errorMessage}`);
      } else if (hasErrors && processedCount > 0) {
        addToast('warning', `Partial upload completed. ${processedCount} of ${totalChunks} chunks processed successfully. Added ${totalNewConversations} new conversations. ${totalDuplicates} duplicates were skipped.`);
      } else if (totalNewConversations === 0 && totalDuplicates > 0) {
        addToast('warning', 'All conversations in the CSV already exist. No new data was added.');
      } else {
        const message = totalDuplicates > 0
          ? `Upload successful! Added ${totalNewConversations} new conversations. ${totalDuplicates} duplicates were skipped.`
          : `Upload successful! Added ${totalNewConversations} new conversations.`;
        addToast('success', message);
      }

      setUploadProgress({
        show: true,
        phase: 'Refreshing data...',
        percentage: 95
      });

      // Reload conversations from the server to get the updated data
      try {
        const conversationsRes = await fetch('/api/conversations');
        const updatedConversations = await conversationsRes.json();
        setConversations(updatedConversations);
      } catch (error) {
        console.error('Error refreshing conversations:', error);
        addToast('warning', 'Upload completed but failed to refresh data. Please refresh the page.');
      }

      setUploadProgress({
        show: true,
        phase: 'Complete!',
        percentage: 100
      });

      // Hide progress bar after showing completion
      setTimeout(() => {
        setUploadProgress({ show: false, phase: '', percentage: 0 });
      }, 2000);

    } catch (error) {
      console.error('Error processing CSV:', error);
      addToast('error', 'Error processing CSV file. Please try again.');
      setUploadProgress({ show: false, phase: '', percentage: 0 });
    } finally {
      setIsUploading(false);
    }

    // Clear the file input
    event.target.value = '';
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
          .filter(c => newValues.length === 0 || (c.metadata.org && newValues.includes(c.metadata.org.name)))
          .map(c => c.metadata.course?.name)
          .filter(name => name !== undefined);
        const filteredCourses = prev.course.filter(course => validCourses.includes(course));

        const validMilestones = conversations
          .filter(c => (newValues.length === 0 || (c.metadata.org && newValues.includes(c.metadata.org.name))) &&
            (filteredCourses.length === 0 || (c.metadata.course && filteredCourses.includes(c.metadata.course.name))))
          .map(c => c.metadata.milestone?.name)
          .filter(name => name !== undefined);
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
          .filter(c => newValues.length === 0 || (c.metadata.course && newValues.includes(c.metadata.course.name)))
          .map(c => c.metadata.milestone?.name)
          .filter(name => name !== undefined);
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

  const handleCreateQueue = async () => {
    if (!newQueueName.trim()) return;

    try {
      setIsCreatingQueue(true);
      const newQueue: AnnotationQueue = {
        id: `queue-${Date.now()}`,
        name: newQueueName.trim(),
        runs: [...filteredConversations],
        createdAt: new Date().toISOString(),
        created_by: currentUser
      };

      const updatedQueues = [...annotationQueues, newQueue];
      setAnnotationQueues(updatedQueues);

      // Save to S3
      await saveQueues(updatedQueues);

      setNewQueueName('');
      setShowCreateQueueModal(false);
      setActiveTab('queues');

      // Navigate directly to the newly created queue
      setSelectedQueue(newQueue);
      setSelectedRunInQueue(null);

      addToast('success', `Annotation queue created successfully!`);
    } catch (error) {
      console.error('Error creating queue:', error);
      addToast('error', 'Error creating annotation queue. Please try again.');
    } finally {
      setIsCreatingQueue(false);
    }
  };

  // Delete queue function
  const handleDeleteQueue = async (queueId: string) => {
    try {
      // Remove the queue from the list
      const updatedQueues = annotationQueues.filter(queue => queue.id !== queueId);
      setAnnotationQueues(updatedQueues);

      // If the deleted queue was selected, clear the selection
      if (selectedQueue?.id === queueId) {
        setSelectedQueue(null);
        setSelectedRunInQueue(null);
      }

      // Save updated queues to API
      await saveQueues(updatedQueues);

      addToast('success', `Annotation queue deleted successfully!`);
    } catch (error) {
      console.error('Error deleting queue:', error);
      addToast('error', 'Error deleting annotation queue. Please try again.');
    }
  };

  // Helper function to get user's annotation progress
  const getUserAnnotationProgress = (conversations: Conversation[]) => {
    const annotatedCount = conversations.filter(conv =>
      conv.annotations?.[currentUser]
    ).length;
    return { annotated: annotatedCount, total: conversations.length };
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

  // Helper function to get all annotators in the current queue
  const getQueueAnnotators = () => {
    if (!selectedQueue) return [];

    const annotators = new Set<string>();
    selectedQueue.runs.forEach(run => {
      if (run.annotations) {
        Object.keys(run.annotations).forEach(annotator => {
          annotators.add(annotator);
        });
      }
    });

    return Array.from(annotators).sort();
  };

  // Navigation functions
  const goToNextRun = () => {
    if (!selectedQueue || !selectedRunInQueue) return;
    const currentIndex = getCurrentRunIndex();
    if (currentIndex < selectedQueue.runs.length - 1) {
      const nextRun = selectedQueue.runs[currentIndex + 1];
      setSelectedRunInQueue(nextRun);
      const userAnnotation = nextRun.annotations?.[currentUser];
      setCurrentAnnotation(userAnnotation?.judgement || null);
      setAnnotationNotes(userAnnotation?.notes || '');

      // Update original values
      setOriginalAnnotation(userAnnotation?.judgement || null);
      setOriginalNotes(userAnnotation?.notes || '');

      // Reset AI tab state when navigating
      setActiveAITab({});
    }
  };

  const goToPreviousRun = () => {
    if (!selectedQueue || !selectedRunInQueue) return;
    const currentIndex = getCurrentRunIndex();
    if (currentIndex > 0) {
      const previousRun = selectedQueue.runs[currentIndex - 1];
      setSelectedRunInQueue(previousRun);
      const userAnnotation = previousRun.annotations?.[currentUser];
      setCurrentAnnotation(userAnnotation?.judgement || null);
      setAnnotationNotes(userAnnotation?.notes || '');

      // Update original values
      setOriginalAnnotation(userAnnotation?.judgement || null);
      setOriginalNotes(userAnnotation?.notes || '');

      // Reset AI tab state when navigating
      setActiveAITab({});
    }
  };

  // Update annotation function
  const handleUpdateAnnotation = async () => {
    if (!selectedQueue || !selectedRunInQueue || !currentAnnotation) return;

    try {
      setIsUpdatingAnnotation(true);

      // Create the annotation object
      const userAnnotation: UserAnnotation = {
        judgement: currentAnnotation,
        notes: annotationNotes.trim(),
        timestamp: new Date().toISOString()
      };

      // Update the run in the queue
      const updatedRuns = selectedQueue.runs.map(run =>
        run.id === selectedRunInQueue.id
          ? {
            ...run,
            annotations: {
              ...run.annotations,
              [currentUser]: userAnnotation
            }
          }
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
      const updatedRun = {
        ...selectedRunInQueue,
        annotations: {
          ...selectedRunInQueue.annotations,
          [currentUser]: userAnnotation
        }
      };
      setSelectedRunInQueue(updatedRun);

      // Also update in main conversations if needed
      const updatedConversations = conversations.map(conv =>
        conv.id === selectedRunInQueue.id
          ? {
            ...conv,
            annotations: {
              ...conv.annotations,
              [currentUser]: userAnnotation
            }
          }
          : conv
      );
      setConversations(updatedConversations);

      // Save both conversations and queues to S3
      await Promise.all([
        saveConversations(updatedConversations),
        saveQueues(updatedQueues)
      ]);

      // Reset original values to current values after successful update
      setOriginalAnnotation(currentAnnotation);
      setOriginalNotes(annotationNotes.trim());

      addToast('success', 'Annotation updated successfully!');
    } catch (error) {
      console.error('Error updating annotation:', error);
      addToast('error', 'Error updating annotation. Please try again.');
    } finally {
      setIsUpdatingAnnotation(false);
    }
  };

  // Initialize annotation state when selecting a run
  const handleRunSelection = (run: Conversation) => {
    setSelectedRunInQueue(run);
    const userAnnotation = run.annotations?.[currentUser];
    setCurrentAnnotation(userAnnotation?.judgement || null);
    setAnnotationNotes(userAnnotation?.notes || '');

    // Store original values for change detection
    setOriginalAnnotation(userAnnotation?.judgement || null);
    setOriginalNotes(userAnnotation?.notes || '');

    // Reset AI tab state when selecting a new run
    setActiveAITab({});
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

  // Sort queue runs - use end_time for sorting
  const getSortedQueueRuns = (runs: Conversation[]) => {
    return [...runs].sort((a, b) => {
      let comparison = 0;

      switch (queueSortBy) {
        case 'timestamp':
          const aTime = new Date(getDisplayTimestamp(a)).getTime();
          const bTime = new Date(getDisplayTimestamp(b)).getTime();
          comparison = aTime - bTime;
          break;
        case 'org':
          const aOrg = a.metadata.org?.name || '';
          const bOrg = b.metadata.org?.name || '';
          comparison = aOrg.localeCompare(bOrg);
          break;
        case 'task_id':
          comparison = (a.metadata.task_id || 0) - (b.metadata.task_id || 0);
          break;
      }

      return queueSortOrder === 'desc' ? -comparison : comparison;
    });
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
            <div className="grid grid-cols-2">
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
                  Question type
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


            </div>

            {/* Row 3: Input Types and Stage - Stage spans 2 columns */}
            <div className="grid grid-cols-2">
              {/* Input Types */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Input types
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
              {/* <div className="col-span-2">
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
              </div> */}
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

            {/* Organizations */}
            {filterOptions.orgs.length > 0 && (<div>
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

                {filterOptions.orgs.map(org => (
                  <label key={org} className="flex items-center px-3 py-1.5 hover:bg-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={filters.org.includes(org)}
                      onChange={() => handleMultiFilterChange('org', org)}
                      className="mr-3 cursor-pointer"
                    />
                    <span className="text-sm text-gray-700">{org}</span>
                  </label>
                ))}
              </div>
            </div>
            )}

            {/* Courses */}
            {filterOptions.courses.length > 0 && (<div>
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
                {
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
                }
              </div>
            </div>)}

            {/* Milestones */}
            {filterOptions.milestones.length > 0 && (<div>
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
                {
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
                }
              </div>
            </div>)}
          </div>
        </div>
      </div>

      {/* Right Side - Filtered Results (50%) */}
      <div className="w-[50%] bg-white rounded-lg shadow-sm border flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-800">
              All runs ({filteredConversations.length})
            </h2>
            {filteredConversations.length > 0 && (
              <div className="text-sm text-gray-600">
                Annotated {getUserAnnotationProgress(filteredConversations).annotated}/{getUserAnnotationProgress(filteredConversations).total}
              </div>
            )}
            {isUploading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600"></div>
            )}
          </div>
          {filteredConversations.length > 0 && (
            <button
              onClick={() => setShowCreateQueueModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 cursor-pointer"
            >
              Create annotation queue
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
                <div className="text-sm text-gray-600">Loading runs...</div>
              </div>
            </div>
          ) : filteredConversations.length === 0 ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-center p-8">
                <div className="text-lg font-medium text-gray-800 mb-2">No runs found</div>

                <div className="text-sm text-gray-500">
                  Export your conversation data from Phoenix and upload the CSV file to get started
                </div>
              </div>
            </div>
          ) : (
            <div className="divide-y">
              {/* Header Row */}
              <div className="p-4 bg-gray-50 font-medium text-sm text-gray-700 grid grid-cols-12 gap-4">
                <div className="col-span-8 flex items-center gap-2">
                  <span className="text-xs">📝</span>
                  <span>Run Details</span>
                </div>
                <div className="col-span-2">Uploaded by</div>
                <div
                  className="col-span-2 flex items-center gap-1 cursor-pointer hover:text-gray-900"
                  onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
                >
                  Timestamp
                  <span className="text-xs">
                    {sortOrder === 'desc' ? '↓' : '↑'}
                  </span>
                </div>
              </div>

              {filteredConversations.map(conv => (
                <div key={conv.id} className="p-4 grid grid-cols-12 gap-4 items-start hover:bg-gray-50">
                  <div className="col-span-8">
                    <div className="flex items-center gap-2 mb-1">
                      {renderAnnotationIcon(conv.annotations?.[currentUser]?.judgement || null)}
                      <div className="text-sm font-medium text-gray-900">
                        org_{conv.metadata.org?.name || 'unknown'}_task_{conv.metadata.task_id || 'unknown'}_user_{conv.metadata.user_id || 'unknown'}
                      </div>
                    </div>

                    {/* Pills - restored and improved */}
                    <div className="flex flex-wrap gap-1 mt-2">
                      {conv.metadata.stage && (
                        <span className={`px-2 py-1 text-xs rounded-full ${conv.metadata.stage === 'router' ? 'bg-green-100 text-green-800' :
                          conv.metadata.stage === 'feedback' ? 'bg-blue-100 text-blue-800' :
                            conv.metadata.stage === 'query_rewrite' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                          }`}>
                          {conv.metadata.stage}
                        </span>
                      )}

                      {conv.metadata.type && (
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                          {conv.metadata.type}
                        </span>
                      )}

                      {conv.metadata.question_input_type && (
                        <span className="px-2 py-1 text-xs rounded-full bg-indigo-100 text-indigo-800">
                          {conv.metadata.question_input_type}
                        </span>
                      )}

                      {conv.metadata.question_type && (
                        <span className="px-2 py-1 text-xs rounded-full bg-teal-100 text-teal-800">
                          {conv.metadata.question_type}
                        </span>
                      )}

                      {conv.metadata.question_purpose && (
                        <span className="px-2 py-1 text-xs rounded-full bg-orange-100 text-orange-800">
                          {conv.metadata.question_purpose}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">
                      {conv.uploaded_by || 'Unknown'}
                    </div>
                  </div>

                  <div className="col-span-2">
                    <div className="text-sm text-gray-600">
                      {formatDate(conv)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create Queue Modal */}
      {showCreateQueueModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Create annotation queue</h3>
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
                disabled={isCreatingQueue}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateQueue}
                disabled={!newQueueName.trim() || isCreatingQueue}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
              >
                {isCreatingQueue && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                )}
                {isCreatingQueue ? 'Creating...' : 'Create Queue'}
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
                        Created: {formatDate({ end_time: queue.createdAt } as Conversation)}
                      </div>
                      {queue.created_by && (
                        <div className="text-xs text-gray-500">
                          Created by: {queue.created_by}
                        </div>
                      )}
                    </div>
                    <div className="ml-2 flex items-center gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteQueue(queue.id);
                        }}
                        className="text-red-400 hover:text-red-600 cursor-pointer p-1 rounded hover:bg-red-50"
                        title="Delete queue"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                      <div className="text-gray-400">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex-1 flex items-center justify-center p-6">
                <div className="text-center text-gray-500">
                  <div className="text-sm font-medium mb-2">No annotation queues</div>
                  <div className="text-xs">Create queues from runs to get started</div>
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

              {/* Show who created the queue */}
              {selectedQueue.created_by && (
                <div className="text-xs text-gray-500 mt-1">
                  Created by {selectedQueue.created_by}
                </div>
              )}
            </div>

            {/* Sorting Controls for Queue */}
            <div className="px-3 py-2 border-b bg-gray-50 flex items-center gap-2">
              <span className="text-xs text-gray-600">Sort:</span>
              <select
                value={queueSortBy}
                onChange={(e) => setQueueSortBy(e.target.value as 'timestamp' | 'org' | 'task_id')}
                className="text-xs border border-gray-300 rounded px-1 py-0.5 cursor-pointer"
              >
                <option value="timestamp">Time</option>
              </select>
              <button
                onClick={() => setQueueSortOrder(queueSortOrder === 'asc' ? 'desc' : 'asc')}
                className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
              >
                {queueSortOrder === 'desc' ? '↓' : '↑'}
              </button>

              {/* Annotator Selector */}
              {getQueueAnnotators().length > 0 && (
                <>
                  <select
                    value={selectedAnnotatorForViewing}
                    onChange={(e) => setSelectedAnnotatorForViewing(e.target.value)}
                    className="text-xs border border-gray-300 rounded px-1 py-0.5 cursor-pointer"
                  >
                    {getQueueAnnotators().map(annotator => (
                      <option key={annotator} value={annotator}>{annotator}</option>
                    ))}
                  </select>
                </>
              )}
            </div>

            <div className="divide-y flex-1 overflow-y-auto">
              {getSortedQueueRuns(selectedQueue.runs).map(run => (
                <div
                  key={run.id}
                  onClick={() => handleRunSelection(run)}
                  className={`p-3 cursor-pointer hover:bg-gray-50 ${selectedRunInQueue?.id === run.id ? 'bg-blue-50 border-r-4 border-blue-500' : ''
                    }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      {renderAnnotationIcon(run.annotations ? run.annotations[selectedAnnotatorForViewing]?.judgement || null : null)}
                      <div className="text-xs font-medium text-gray-900 flex-1 min-w-0 truncate">
                        org_{run.metadata.org?.name || 'unknown'}_task_{run.metadata.task_id || 'unknown'}_user_{run.metadata.user_id || 'unknown'}
                      </div>
                    </div>
                    <div className="text-xs text-gray-500">
                      {formatDate(run)}
                    </div>
                    <div className="flex gap-1 flex-wrap">
                      {run.metadata.stage && (
                        <span className={`px-1.5 py-0.5 text-xs rounded-full ${run.metadata.stage === 'router' ? 'bg-green-100 text-green-800' :
                          run.metadata.stage === 'feedback' ? 'bg-blue-100 text-blue-800' :
                            run.metadata.stage === 'query_rewrite' ? 'bg-yellow-100 text-yellow-800' :
                              'bg-gray-100 text-gray-800'
                          }`}>
                          {run.metadata.stage}
                        </span>
                      )}
                      {run.uploaded_by && (
                        <span className="px-1.5 py-0.5 text-xs rounded-full bg-gray-100 text-gray-600">
                          by {run.uploaded_by}
                        </span>
                      )}
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
            <div className="text-xl font-medium mb-3">No annotation queues</div>
            <div className="text-sm text-gray-400">Go to the Runs tab, apply filters, and create your first annotation queue to get started</div>
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
                      org_{selectedRunInQueue.metadata.org?.name || 'unknown'}_task_{selectedRunInQueue.metadata.task_id || 'unknown'}_user_{selectedRunInQueue.metadata.user_id || 'unknown'}
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
                    {/* Context Display - shown at the start if available */}
                    {(() => {
                      // Look for context in the conversation data
                      let contextContent = '';

                      // Check if there's a context field directly in the run
                      if (selectedRunInQueue.context) {
                        contextContent = selectedRunInQueue.context;
                      }
                      // Check if context is in metadata
                      else if (selectedRunInQueue.metadata.context) {
                        contextContent = selectedRunInQueue.metadata.context;
                      }
                      // Check if context might be in the first user message or extracted from messages
                      else if (selectedRunInQueue.messages && selectedRunInQueue.messages.length > 0) {
                        // Look for context in message content or other fields
                        const firstMessage = selectedRunInQueue.messages[0];
                        if (firstMessage.context) {
                          contextContent = firstMessage.context;
                        }
                      }

                      // Only show context if we have content and question_has_context is true
                      if (contextContent) {
                        return (
                          <div className="flex justify-center">
                            <div className="max-w-3xl p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                              <div className="text-sm text-yellow-700 whitespace-pre-wrap">
                                {contextContent}
                              </div>
                            </div>
                          </div>
                        );
                      }

                      return null;
                    })()}

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
                            {message.role === 'user' ? 'User' : (
                              // For assistant messages, check if it's an objective quiz to show tick/cross
                              (() => {
                                try {
                                  // Handle both JSON string and already parsed object
                                  let parsedContent;
                                  if (typeof message.content === 'string') {
                                    parsedContent = JSON.parse(message.content);
                                  } else if (typeof message.content === 'object' && message.content !== null) {
                                    parsedContent = message.content;
                                  } else {
                                    return 'Assistant';
                                  }

                                  const { type, question_type } = selectedRunInQueue.metadata;

                                  // For quiz type with objective questions, show tick/cross with Assistant
                                  if (type === 'quiz' && question_type === 'objective' && parsedContent.hasOwnProperty('is_correct')) {
                                    const { is_correct } = parsedContent;
                                    return (
                                      <div className="flex items-center gap-2">
                                        <span>Assistant</span>
                                        {is_correct ? (
                                          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                            </svg>
                                          </div>
                                        ) : (
                                          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                            </svg>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  return 'Assistant';
                                } catch {
                                  return 'Assistant';
                                }
                              })()
                            )}
                          </div>
                          {message.role === 'assistant' ? (
                            (() => {
                              try {
                                // Handle both JSON string and already parsed object
                                let parsedContent;
                                if (typeof message.content === 'string') {
                                  parsedContent = JSON.parse(message.content);
                                } else if (typeof message.content === 'object' && message.content !== null) {
                                  parsedContent = message.content;
                                } else {
                                  // Not an object or string, render as-is
                                  return <div className="whitespace-pre-wrap">{String(message.content)}</div>;
                                }

                                const { type, question_type } = selectedRunInQueue.metadata;

                                // For quiz type with objective questions
                                if (type === 'quiz' && question_type === 'objective') {
                                  const { analysis, feedback } = parsedContent;
                                  const currentTab = activeAITab[index] || 'feedback';

                                  return (
                                    <div className="space-y-3">
                                      {/* Tab buttons */}
                                      <div className="flex border-b border-gray-300">
                                        <button
                                          onClick={() => setActiveAITab(prev => ({ ...prev, [index]: 'feedback' }))}
                                          className={`px-4 py-2 text-sm font-medium cursor-pointer ${currentTab === 'feedback'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}
                                        >
                                          Feedback
                                        </button>
                                        <button
                                          onClick={() => setActiveAITab(prev => ({ ...prev, [index]: 'analysis' }))}
                                          className={`px-4 py-2 text-sm font-medium cursor-pointer ${currentTab === 'analysis'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}
                                        >
                                          Analysis
                                        </button>
                                      </div>

                                      {/* Tab content */}
                                      <div className="whitespace-pre-wrap">
                                        {currentTab === 'feedback' ? String(feedback || '') : String(analysis || '')}
                                      </div>
                                    </div>
                                  );
                                }

                                // For quiz type with subjective questions
                                if (type === 'quiz' && question_type === 'subjective') {
                                  const { feedback, scorecard } = parsedContent;
                                  const currentTab = activeAITab[index] || 'feedback';

                                  return (
                                    <div className="space-y-3">
                                      {/* Tab buttons */}
                                      <div className="flex border-b border-gray-300">
                                        <button
                                          onClick={() => setActiveAITab(prev => ({ ...prev, [index]: 'feedback' }))}
                                          className={`px-4 py-2 text-sm font-medium cursor-pointer ${currentTab === 'feedback'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}
                                        >
                                          Feedback
                                        </button>
                                        <button
                                          onClick={() => setActiveAITab(prev => ({ ...prev, [index]: 'scorecard' }))}
                                          className={`px-4 py-2 text-sm font-medium cursor-pointer ${currentTab === 'scorecard'
                                            ? 'border-b-2 border-blue-500 text-blue-600'
                                            : 'text-gray-600 hover:text-gray-800'
                                            }`}
                                        >
                                          Scorecard
                                        </button>
                                      </div>

                                      {/* Tab content */}
                                      <div className="whitespace-pre-wrap">
                                        {currentTab === 'feedback' ? (
                                          String(feedback || '')
                                        ) : (
                                          <div className="space-y-4">
                                            {scorecard && Array.isArray(scorecard) ? (
                                              <div className="space-y-3">
                                                {scorecard.map((item: ScorecardCriterion, scorecardIndex: number) => (
                                                  <div key={scorecardIndex} className="border border-gray-200 rounded-lg p-4 bg-white">
                                                    <div className="flex justify-between items-start mb-2">
                                                      <div className="flex items-center gap-2">
                                                        {item.score >= item.pass_score ? (
                                                          <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center">
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                                            </svg>
                                                          </div>
                                                        ) : (
                                                          <div className="w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                                                            <svg className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                                            </svg>
                                                          </div>
                                                        )}
                                                        <h5 className="font-medium text-gray-900">{String(item.category || '')}</h5>
                                                      </div>
                                                      <div className="text-right">
                                                        <div className="text-sm font-medium">
                                                          {item.score}/{item.max_score} (Pass: {item.pass_score})
                                                        </div>
                                                      </div>
                                                    </div>
                                                    <div className="text-sm text-gray-700">
                                                      {item.feedback?.correct && (
                                                        <div className="mb-2">
                                                          <span className="font-medium text-green-700">✓ Correct: </span>
                                                          {String(item.feedback.correct)}
                                                        </div>
                                                      )}
                                                      {item.feedback?.wrong && (
                                                        <div>
                                                          <span className="font-medium text-red-700">✗ Issue: </span>
                                                          {String(item.feedback.wrong)}
                                                        </div>
                                                      )}
                                                    </div>
                                                  </div>
                                                ))}
                                              </div>
                                            ) : (
                                              <div className="text-gray-500">No scorecard data available</div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  );
                                }

                                // For learning_material type
                                if (type === 'learning_material') {
                                  return (
                                    <div className="whitespace-pre-wrap">
                                      {String(parsedContent.response || 'No response available')}
                                    </div>
                                  );
                                }

                                // Fallback for other types - show formatted content
                                return <div className="whitespace-pre-wrap">{JSON.stringify(parsedContent, null, 2)}</div>;

                              } catch {
                                // If content can't be processed as object, show as plain text
                                return <div className="whitespace-pre-wrap">{String(message.content)}</div>;
                              }
                            })()
                          ) : (
                            <div className="whitespace-pre-wrap">{message.content}</div>
                          )}
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
                            disabled={!currentAnnotation || !hasAnnotationChanges() || isUpdatingAnnotation}
                            className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-sm font-medium cursor-pointer flex items-center justify-center gap-2"
                          >
                            {isUpdatingAnnotation && (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                            )}
                            {isUpdatingAnnotation ? 'Updating...' : 'Update annotation'}
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

                          {selectedRunInQueue.span_id && (
                            <div>
                              <div className="font-medium text-gray-600">Span ID</div>
                              <div className="text-gray-900 font-mono text-xs">{selectedRunInQueue.span_id}</div>
                            </div>
                          )}

                          {selectedRunInQueue.trace_id && (
                            <div>
                              <div className="font-medium text-gray-600">Trace ID</div>
                              <div className="text-gray-900 font-mono text-xs">{selectedRunInQueue.trace_id}</div>
                            </div>
                          )}

                          {selectedRunInQueue.span_kind && (
                            <div>
                              <div className="font-medium text-gray-600">Span Kind</div>
                              <div className="text-gray-900">{selectedRunInQueue.span_kind}</div>
                            </div>
                          )}

                          {selectedRunInQueue.span_name && (
                            <div>
                              <div className="font-medium text-gray-600">Span Name</div>
                              <div className="text-gray-900">{selectedRunInQueue.span_name}</div>
                            </div>
                          )}

                          {selectedRunInQueue.model_name && (
                            <div>
                              <div className="font-medium text-gray-600">Model Name</div>
                              <div className="text-gray-900">{selectedRunInQueue.model_name}</div>
                            </div>
                          )}

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
                            <div className="text-gray-900">{selectedRunInQueue.metadata.org?.name || 'N/A'}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Course</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.course?.name || 'N/A'}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Milestone</div>
                            <div className="text-gray-900">{selectedRunInQueue.metadata.milestone?.name || 'N/A'}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">Start Time</div>
                            <div className="text-gray-900">{selectedRunInQueue.start_time ? formatDate({ end_time: selectedRunInQueue.start_time } as Conversation) : 'N/A'}</div>
                          </div>

                          <div>
                            <div className="font-medium text-gray-600">End Time</div>
                            <div className="text-gray-900">{selectedRunInQueue.end_time ? formatDate({ end_time: selectedRunInQueue.end_time } as Conversation) : 'N/A'}</div>
                          </div>

                          {selectedRunInQueue.uploaded_by && (
                            <div>
                              <div className="font-medium text-gray-600">Uploaded by</div>
                              <div className="text-gray-900">{selectedRunInQueue.uploaded_by}</div>
                            </div>
                          )}
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
                <div className="text-lg font-medium mb-2">No task selected</div>
                <div className="text-sm">Select a task from the queue to view its details</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        // No Queue Selected
        <div className="w-4/5 bg-white rounded-lg shadow-sm border flex items-center justify-center">
          <div className="text-center text-gray-500 p-8">
            <div className="text-lg font-medium mb-2">No queue selected</div>
            <div className="text-sm">Select an annotation queue from the list to view and annotate its tasks</div>
          </div>
        </div>
      )}
    </div>
  );

  // Toast Component
  const ToastContainer = () => (
    <div className="fixed top-4 right-4 z-50 space-y-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`max-w-sm p-4 rounded-lg shadow-lg border-l-4 transition-all duration-300 ease-in-out transform translate-x-0 ${toast.type === 'success'
            ? 'bg-green-50 border-green-400 text-green-800'
            : toast.type === 'error'
              ? 'bg-red-50 border-red-400 text-red-800'
              : 'bg-yellow-50 border-yellow-400 text-yellow-800'
            }`}
        >
          <div className="flex items-start justify-between">
            <div className="flex">
              <div className="flex-shrink-0">
                {toast.type === 'success' && (
                  <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
                {toast.type === 'error' && (
                  <svg className="w-5 h-5 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                )}
                {toast.type === 'warning' && (
                  <svg className="w-5 h-5 text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.732-.833-2.5 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                )}
              </div>
              <div className="ml-3">
                <p className="text-sm font-medium">{toast.message}</p>
              </div>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="ml-4 flex-shrink-0 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen p-4 bg-gray-50">
      {/* Toast Container */}
      <ToastContainer />

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
            <label className={`cursor-pointer ${isUploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
                disabled={isUploading}
              />
              <div className={`px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md border text-sm font-medium cursor-pointer flex items-center gap-2 ${isUploading ? 'cursor-not-allowed' : ''}`}>
                {isUploading && (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-600"></div>
                )}
                {isUploading ? 'Uploading...' : 'Upload CSV'}
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

      {/* Upload Progress Bar - Bottom Right */}
      {uploadProgress.show && (
        <div className="fixed bottom-4 right-4 bg-white rounded-lg shadow-lg border p-4 w-80 z-50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Uploading CSV</span>
            <span className="text-sm text-gray-500">{uploadProgress.percentage}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 mb-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300 ease-out"
              style={{ width: `${uploadProgress.percentage}%` }}
            ></div>
          </div>
          <p className="text-xs text-gray-600">{uploadProgress.phase}</p>
        </div>
      )}
    </div>
  );
}
