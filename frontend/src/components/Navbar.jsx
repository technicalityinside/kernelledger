import { NavLink } from 'react-router-dom'

const link = ({ isActive }) =>
  `px-4 py-2 rounded-md text-sm font-medium transition-colors ${
    isActive
      ? 'bg-blue-600 text-white'
      : 'text-gray-400 hover:text-white hover:bg-gray-800'
  }`

export default function Navbar() {
  return (
    <nav className="border-b border-gray-800 bg-gray-900/80 backdrop-blur sticky top-0 z-10">
      <div className="max-w-7xl mx-auto px-6 flex items-center gap-1 h-14">
        <span className="text-base font-bold text-white mr-6 tracking-tight">
          Garuda <span className="text-blue-400 font-normal">Portal</span>
        </span>
        <NavLink to="/compare"     className={link}>Compare</NavLink>
        <NavLink to="/regressions" className={link}>Regressions</NavLink>
        <NavLink to="/systems"     className={link}>Systems</NavLink>
      </div>
    </nav>
  )
}
