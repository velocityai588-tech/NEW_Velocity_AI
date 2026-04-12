import express, { Request, Response } from "express"
import { GoogleGenerativeAI } from "@google/generative-ai"
import fetch from "node-fetch"
import * as fs from "fs"
import * as path from "path"
import Papa from "papaparse"
import dotenv from "dotenv"

// Load environment variables
dotenv.config()

const router = express.Router()

// Initialize Gemini
let genAI: GoogleGenerativeAI | null = null
try {
  console.log('GEMINI_API_KEY from env:', process.env.GEMINI_API_KEY ? 'SET' : 'NOT SET')
  if (process.env.GEMINI_API_KEY) {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
    console.log('Gemini initialized successfully')
  } else {
    console.warn('GEMINI_API_KEY not set, Gemini features will be disabled')
  }
} catch (error) {
  console.error('Failed to initialize Gemini:', error)
}

const model = genAI ? genAI.getGenerativeModel({ model: "gemini-1.5-flash" }) : null

// In-memory cache for skill matches (since DB is ignored)
interface SkillMatchCache {
  [key: string]: {
    match: boolean
    confidence: number
    createdAt: Date
  }
}

const skillMatchCache: SkillMatchCache = {}

// Employee data loaded from CSV
interface Employee {
  id: string
  name: string
  skills: string[]
}

let employees: Employee[] = []

// Load employees from CSV
async function loadEmployees(): Promise<void> {
  try {
    const csvPath = path.join(process.cwd(), 'public', 'data', 'employees.csv')
    console.log('Loading employees from:', csvPath)
    
    if (!fs.existsSync(csvPath)) {
      console.warn('[DeployedRoutes] employees.csv not found at:', csvPath);
      employees = [];
      return;
    }

    const csvText = fs.readFileSync(csvPath, 'utf-8')
    console.log('CSV text length:', csvText.length)
    
    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true
    })
    
    console.log('Parsed data:', parsed.data)
    employees = parsed.data.map((row: any, index: number) => ({
      id: `emp${index + 1}`,
      name: row.name,
      skills: row.skills ? row.skills.split(',').map((s: string) => s.trim()) : []
    }))
    
    console.log(`Loaded ${employees.length} employees from CSV:`, employees)
  } catch (error) {
    console.error('Error loading employees CSV:', error)
    // Fallback to empty array
    employees = []
  }
}

// Load employees on startup
loadEmployees()

// Mock task data
const mockTasks: Record<string, any> = {
  "task1": {
    id: "task1",
    title: "Mobile App Development",
    description: "Develop a cross-platform mobile app using React Native with iOS and Android support",
    jiraIssueId: "TEST-123"
  }
}

async function getGeminiSkillMatch(taskDescription: string, employeeSkills: string[]): Promise<{ match: boolean, confidence: number }> {
  if (!model) {
    console.warn('Gemini model not available, returning default confidence')
    return { match: true, confidence: 0.5 }
  }

  const cacheKey = `${taskDescription}-${employeeSkills.join(',')}`

  if (skillMatchCache[cacheKey] && (Date.now() - skillMatchCache[cacheKey].createdAt.getTime()) < 24 * 60 * 60 * 1000) {
    return skillMatchCache[cacheKey]
  }

  const prompt = `You are a technical skill matcher.

Task description: ${taskDescription}

Employee skills: ${JSON.stringify(employeeSkills)}

Analyze if the employee's skills match the requirements in the task description.
Return JSON: { "match": boolean, "confidence": number between 0 and 1 }`

  try {
    // Add small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 500))
    
    const result = await model.generateContent(prompt)
    const response = await result.response
    const text = response.text()

    // Parse JSON response
    const parsed = JSON.parse(text.trim())
    const match = parsed.match || false
    const confidence = Math.max(0, Math.min(1, parsed.confidence || 0))

    skillMatchCache[cacheKey] = { match, confidence, createdAt: new Date() }
    return { match, confidence }
  } catch (error) {
    console.error('Gemini API error:', error)
    // Return a default score instead of failing
    return { match: false, confidence: 0.1 }
  }
}

async function calculateEmployeeScore(employee: Employee, taskDescription: string): Promise<{
  employeeId: string
  score: number
  skillMatchConfidence: number
}> {
  console.log(`Calculating score for employee ${employee.name} with skills:`, employee.skills)
  // Get Gemini confidence for skill matching based on task description
  const geminiResult = await getGeminiSkillMatch(taskDescription, employee.skills)
  console.log(`Gemini result for ${employee.name}:`, geminiResult)
  
  return {
    employeeId: employee.id,
    score: geminiResult.confidence,
    skillMatchConfidence: geminiResult.confidence
  }
}

async function assignJiraIssue(issueId: string, assigneeAccountId: string): Promise<void> {
  if (!process.env.AUTO_ASSIGN_ENABLED || process.env.AUTO_ASSIGN_ENABLED !== 'true') {
    console.log('Auto-assign disabled, skipping Jira assignment')
    return
  }

  const domain = process.env.JIRA_DOMAIN
  const email = process.env.JIRA_EMAIL
  const apiToken = process.env.JIRA_API_TOKEN

  if (!domain || !email || !apiToken) {
    throw new Error('Jira configuration missing')
  }

  const auth = Buffer.from(`${email}:${apiToken}`).toString('base64')
  const url = `https://${domain}/rest/api/3/issue/${issueId}/assignee`

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      accountId: assigneeAccountId
    })
  })

  if (!response.ok) {
    throw new Error(`Jira assignment failed: ${response.statusText}`)
  }
}

// POST /api/deployed/add-skill-and-reassign
router.post('/add-skill-and-reassign', async (req: Request, res: Response) => {
  try {
    const { taskId, newSkill } = req.body

    if (!taskId || !newSkill) {
      return res.status(400).json({ error: 'taskId and newSkill are required' })
    }

    const task = mockTasks[taskId]
    if (!task) {
      return res.status(404).json({ error: 'Task not found' })
    }

    // Update task description with new skill
    task.description += ` Required skill: ${newSkill}`

    // Calculate scores for all employees sequentially to avoid rate limiting
    const employeeScores: Array<{
      employeeId: string
      score: number
      skillMatchConfidence: number
    }> = []
    
    for (const emp of employees) {
      try {
        const score = await calculateEmployeeScore(emp, task.description)
        employeeScores.push(score)
      } catch (error) {
        console.error(`Error calculating score for ${emp.name}:`, error)
        // Add default score
        employeeScores.push({
          employeeId: emp.id,
          score: 0.1,
          skillMatchConfidence: 0.1
        })
      }
    }

    // Find best employee
    const bestEmployee = employeeScores.reduce((best, current) =>
      current.score > best.score ? current : best
    )

    const assignedEmployee = employees.find(emp => emp.id === bestEmployee.employeeId)

    // Auto-assign in Jira (mock assignee ID for now)
    try {
      await assignJiraIssue(task.jiraIssueId, bestEmployee.employeeId)
    } catch (error) {
      console.error('Jira assignment failed:', error)
      // Continue anyway
    }

    res.json({
      taskId,
      assignedEmployeeId: bestEmployee.employeeId,
      score: bestEmployee.score,
      skillMatchConfidence: bestEmployee.skillMatchConfidence
    })

  } catch (error) {
    console.error('Error in add-skill-and-reassign:', error)
    res.status(500).json({ error: 'Internal server error' })
  }
})

export default router