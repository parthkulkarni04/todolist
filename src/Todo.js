import React, { useState, useEffect } from 'react';
import { Trash2, Check, Edit, Calendar, MessageCircle } from 'lucide-react';
import { Input } from "./components/ui/input";
import { Button } from "./components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "./components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./components/ui/select";
import { generateClient } from 'aws-amplify/api'
import { listTasks } from './graphql/queries';
import { createTask, updateTask, deleteTask as deleteTaskMutation } from './graphql/mutations';
import {Amplify} from 'aws-amplify';

import config from './amplifyconfiguration.json';
Amplify.configure(config);

const client = generateClient();

const Todo = () => {
  const [tasks, setTasks] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterPriority, setFilterPriority] = useState('all');
  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  // TaskForm state
  const [taskText, setTaskText] = useState('');
  const [taskCategory, setTaskCategory] = useState('personal');
  const [taskDueDate, setTaskDueDate] = useState('');
  const [taskPriority, setTaskPriority] = useState('medium');

  useEffect(() => {
    const storedTasks = JSON.parse(localStorage.getItem('tasks')) || [];
    setTasks(storedTasks);
    
  }, []);

  useEffect(() => {
    localStorage.setItem('tasks', JSON.stringify(tasks));
  }, [tasks]);

  const resetTaskForm = () => {
    setTaskText('');
    setTaskCategory('personal');
    setTaskDueDate('');
    setTaskPriority('medium');
    setEditingTask(null);
  };

  useEffect(() => {
    fetchTasks();
  }, []);

  // Function to fetch tasks from DynamoDB
  async function fetchTasks() {
    try {
      // GraphQL query to get all tasks for the current user
      const taskData = await client.graphql(
        {query: listTasks,
        authMode: 'userPool'});
      const taskList = taskData.data.listTasks.items;
      setTasks(taskList);
      setIsLoading(true);
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setIsLoading(false);
    }
  }

  // Function to handle task creation/updating
  const handleTaskSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingTask) {
        // If editing, update existing task
        const updateDetails = {
          id: editingTask.id,
          text: taskText,
          category: taskCategory,
          dueDate: taskDueDate,
          priority: taskPriority,
          completed: editingTask.completed
        };
        await client.graphql( { 
          query: updateTask,
          variables: {
            input: {
              id: updateDetails.id,
              text: updateDetails.text,
              category: updateDetails.category,
              dueDate: updateDetails.dueDate,
              priority: updateDetails.priority,
              completed: updateDetails.completed
            }
          },
        authMode: 'userPool'
      });
      } else {
        // If new task, create it
 
        await client.graphql({ 
          query: createTask,
          variables :{
            input: {
              text: taskText,
              category: taskCategory,
              dueDate: taskDueDate || null,
              priority: taskPriority,
              completed: false
          }},
        authMode: 'userPool'
      });
      }
      fetchTasks(); // Refresh the task list
      resetTaskForm();
      setIsAddTaskOpen(false);
    } catch (err) {
      console.error('Error saving task:', err);
    }
  };

  // Function to delete a task
  const deleteTask = async (task) => {
    try {
      await client.graphql({ 
        query: deleteTaskMutation,
        variables: {
          input: task.id,
          _version: task._version 
        },
      authMode: 'userPool'
    });
      fetchTasks(); // Refresh the task list
    } catch (err) {
      console.error('Error deleting task:', err);
    }
  };

  // Function to toggle task completiond
  const toggleTask = async (task) => {
    try {
      const updatedTask = {
        id: task.id,
        text: task.text,
        category: task.category,
        dueDate: task.dueDate || null,
        priority: task.priority,
        completed: !task.completed
      };
      
      await client.graphql({ 
        query: updateTask,
        variables: {
          input: updatedTask
        },
        authMode: 'userPool'
      });
      
      fetchTasks(); // Refresh task list
    } catch (err) {
      console.error('Error toggling task:', err);
    }
  };
  
  
  const startEditTask = (task) => {
    setEditingTask(task);
    setTaskText(task.text);
    setTaskCategory(task.category);
    setTaskDueDate(task.dueDazte);
    setTaskPriority(task.priority);
    setIsAddTaskOpen(true);
  };

  const filteredTasks = tasks.filter(task =>
    task.text.toLowerCase().includes(searchTerm.toLowerCase()) &&
    (filterCategory === 'all' || task.category === filterCategory) &&
    (filterPriority === 'all' || task.priority === filterPriority)
  );

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'low': return 'bg-green-200 text-green-800';
      case 'medium': return 'bg-yellow-200 text-yellow-800';
      case 'high': return 'bg-red-200 text-red-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'personal': return 'bg-blue-200 text-blue-800';
      case 'work': return 'bg-purple-200 text-purple-800';
      case 'shopping': return 'bg-pink-200 text-pink-800';
      case 'other': return 'bg-indigo-200 text-indigo-800';
      default: return 'bg-gray-200 text-gray-800';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-100 to-purple-200 p-8">
      <div className="max-w-4xl mx-auto bg-white rounded-xl shadow-xl overflow-hidden">
        <div className="p-8">
          <h1 className="text-4xl font-bold mb-8 text-center text-indigo-600">Task Manager</h1>
          
          <div className="flex flex-wrap gap-4 mb-8">
            <Input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search tasks"
              className="flex-grow"
            />
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="personal">Personal</SelectItem>
                <SelectItem value="work">Work</SelectItem>
                <SelectItem value="shopping">Shopping</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterPriority} onValueChange={setFilterPriority}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Priority" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Priorities</SelectItem>
                <SelectItem value="low">Low</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="high">High</SelectItem>
              </SelectContent>
            </Select>
            <Dialog open={isAddTaskOpen} onOpenChange={(open) => {
              setIsAddTaskOpen(open);
              if (!open) resetTaskForm();
            }}>
              <DialogTrigger asChild>
                <Button className="bg-indigo-500 hover:bg-indigo-600 text-white">Add Task</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingTask ? 'Edit Task' : 'Add New Task'}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleTaskSubmit} className="space-y-4">
                  <Input
                    type="text"
                    value={taskText}
                    onChange={(e) => setTaskText(e.target.value)}
                    placeholder="Task description"
                    required
                  />
                  <Select value={taskCategory} onValueChange={setTaskCategory}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select a category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="personal">Personal</SelectItem>
                      <SelectItem value="work">Work</SelectItem>
                      <SelectItem value="shopping">Shopping</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <Input
                    type="date"
                    value={taskDueDate}
                    onChange={(e) => setTaskDueDate(e.target.value)}
                  />
                  <Select value={taskPriority} onValueChange={setTaskPriority}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select priority" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button type="submit" className="w-full bg-indigo-500 hover:bg-indigo-600 text-white">
                    {editingTask ? 'Update Task' : 'Add Task'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <ul className="space-y-4">
            {filteredTasks.map(task => (
              <li 
                key={task.id} 
                className={`flex items-center justify-between bg-white p-4 rounded-lg shadow transition-all duration-300 ${
                  task.completed ? 'opacity-50' : ''
                }`}
              >
                <div className="flex items-center space-x-4">
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => toggleTask(task.id)}
                    className={`${
                      task.completed ? 'text-green-500' : 'text-gray-400'
                    } hover:text-green-600`}
                  >
                    <Check size={20} />
                  </Button>
                  <div>
                    <span className={`text-lg ${
                      task.completed ? 'line-through text-gray-500' : ''
                    }`}>
                      {task.text}
                    </span>
                    <div className="text-sm flex items-center space-x-2 mt-1">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        getCategoryColor(task.category)
                      }`}>
                        {task.category}
                      </span>
                      <span className="flex items-center">
                        <Calendar size={14} className="mr-1 text-gray-500" />
                        <span className="text-gray-600">{task.dueDate || 'No due date'}</span>
                      </span>
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                        getPriorityColor(task.priority)
                      }`}>
                        {task.priority}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex space-x-2">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => startEditTask(task)} 
                    className="text-blue-500 hover:text-blue-600"
                  >
                    <Edit size={20} />
                  </Button>
                  <Button 
                    variant="ghost"
                    size="icon"
                    onClick={() => deleteTask(task.id, task._version)}
                    className="text-red-500 hover:text-red-600"
                  >
                    <Trash2 size={20} />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
      
      {/* AI Chatbot Button */}
      <Button
        className="fixed bottom-4 right-4 bg-indigo-500 hover:bg-indigo-600 text-white rounded-full p-4 shadow-lg"
        onClick={() => alert('AI Chatbot functionality not implemented')}
      >
        <MessageCircle size={24} />
      </Button>
    </div>
  );
};

export default Todo;