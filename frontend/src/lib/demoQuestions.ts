import type { Question } from "@/lib/types";

export const dailyQuestions: Question[] = [
  { id: "d1", subject: "Physics", topic: "Newton's Laws", difficulty: "Easy", question: "A body of mass 2 kg is acted upon by a net force of 10 N. What is its acceleration?", options: ["2 m/s²", "5 m/s²", "10 m/s²", "20 m/s²"], answer: 1 },
  { id: "d2", subject: "Chemistry", topic: "Atomic Structure", difficulty: "Easy", question: "Which quantum number determines the shape of an orbital?", options: ["Principal", "Azimuthal", "Magnetic", "Spin"], answer: 1 },
  { id: "d3", subject: "Mathematics", topic: "Quadratic Equations", difficulty: "Medium", question: "If the roots of x² − 5x + k = 0 differ by 1, find k.", options: ["4", "5", "6", "7"], answer: 2 },
  { id: "d4", subject: "Physics", topic: "Rotational Motion", difficulty: "Hard", question: "The moment of inertia of a thin ring about its diameter is:", options: ["MR²", "MR²/2", "2MR²", "MR²/4"], answer: 1 },
  { id: "d5", subject: "Chemistry", topic: "Organic Reactions", difficulty: "Medium", question: "SN2 reactions at a chiral carbon generally result in:", options: ["Retention", "Racemisation", "Inversion", "No stereochemical change"], answer: 2 },
  { id: "d6", subject: "Mathematics", topic: "Calculus", difficulty: "Medium", question: "The value of ∫₀¹ 3x² dx is:", options: ["1/3", "1", "3", "0"], answer: 1 },
  { id: "d7", subject: "Physics", topic: "Electrostatics", difficulty: "Hard", question: "The electric field inside a charged conducting shell in electrostatic equilibrium is:", options: ["Maximum", "Constant non-zero", "Zero", "Dependent on radius"], answer: 2 },
  { id: "d8", subject: "Chemistry", topic: "Chemical Bonding", difficulty: "Easy", question: "The hybridisation of carbon in methane is:", options: ["sp", "sp²", "sp³", "dsp²"], answer: 2 },
  { id: "d9", subject: "Mathematics", topic: "Sequences", difficulty: "Medium", question: "The common ratio of the GP 3, 6, 12, ... is:", options: ["1", "2", "3", "6"], answer: 1 },
  { id: "d10", subject: "Physics", topic: "Waves", difficulty: "Medium", question: "The speed of a wave is 340 m/s and its frequency is 170 Hz. Its wavelength is:", options: ["0.5 m", "1 m", "2 m", "4 m"], answer: 2 },
  { id: "d11", subject: "Chemistry", topic: "Thermodynamics", difficulty: "Hard", question: "For a spontaneous process at constant temperature and pressure, ΔG is:", options: ["> 0", "< 0", "= 1", "Always 0"], answer: 1 },
  { id: "d12", subject: "Mathematics", topic: "Coordinate Geometry", difficulty: "Hard", question: "The slope of a line perpendicular to 2x + 3y − 6 = 0 is:", options: ["−2/3", "2/3", "3/2", "−3/2"], answer: 2 },
  { id: "d13", subject: "Physics", topic: "Modern Physics", difficulty: "JEE Advanced", question: "The de Broglie wavelength of a particle is inversely proportional to its:", options: ["Energy", "Momentum", "Velocity squared", "Mass only"], answer: 1 },
  { id: "d14", subject: "Chemistry", topic: "Electrochemistry", difficulty: "Medium", question: "The SI unit of molar conductivity is:", options: ["S m² mol⁻¹", "S m⁻¹", "Ω m", "C mol⁻¹"], answer: 0 },
  { id: "d15", subject: "Mathematics", topic: "Probability", difficulty: "Medium", question: "A fair coin is tossed twice. The probability of exactly one head is:", options: ["1/4", "1/2", "3/4", "1"], answer: 1 },
  { id: "d16", subject: "Physics", topic: "Current Electricity", difficulty: "Hard", question: "Two resistors 6 Ω and 3 Ω are connected in parallel. Their equivalent resistance is:", options: ["9 Ω", "3 Ω", "2 Ω", "1 Ω"], answer: 2 },
  { id: "d17", subject: "Chemistry", topic: "Coordination Compounds", difficulty: "JEE Advanced", question: "The coordination number of cobalt in [Co(NH₃)₆]Cl₃ is:", options: ["3", "4", "6", "9"], answer: 2 },
  { id: "d18", subject: "Mathematics", topic: "Matrices", difficulty: "Hard", question: "If A is a 2 × 2 identity matrix, det(A) equals:", options: ["0", "1", "2", "4"], answer: 1 },
  { id: "d19", subject: "Physics", topic: "Gravitation", difficulty: "Medium", question: "The escape velocity from Earth's surface is approximately:", options: ["7.9 km/s", "9.8 km/s", "11.2 km/s", "15 km/s"], answer: 2 },
  { id: "d20", subject: "Chemistry", topic: "Solutions", difficulty: "Easy", question: "A solution with pH 7 at 25°C is:", options: ["Acidic", "Basic", "Neutral", "Buffer only"], answer: 2 },
];

export const examQuestions = dailyQuestions.slice(0, 10).map((question, index) => ({
  ...question,
  id: `e${index + 1}`,
  difficulty: index % 3 === 0 ? "JEE Advanced" : question.difficulty,
}));