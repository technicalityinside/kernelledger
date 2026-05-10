export default function Select({ label, value, onChange, options, disabled, placeholder }) {
  return (
    <div>
      <label className="block text-xs text-gray-500 uppercase tracking-wide mb-1.5">
        {label}
      </label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled || !options?.length}
        className="w-full bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm
                   focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500
                   disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <option value="">{placeholder ?? '— select —'}</option>
        {options?.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  )
}
