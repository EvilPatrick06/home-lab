import { useNavigate } from 'react-router'
import { useNetworkStore } from '../stores/use-network-store'

const menuItems = [
  {
    label: 'Your Characters',
    path: '/characters',
    description: 'Browse your heroes from past and present campaigns',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path
          fillRule="evenodd"
          d="M7.5 6a4.5 4.5 0 1 1 9 0 4.5 4.5 0 0 1-9 0ZM3.751 20.105a8.25 8.25 0 0 1 16.498 0 .75.75 0 0 1-.437.695A18.683 18.683 0 0 1 12 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 0 1-.437-.695Z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    label: 'My Campaigns',
    path: '/make',
    description: 'View, create, and manage your campaigns',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path d="M11.25 4.533A9.707 9.707 0 0 0 6 3a9.735 9.735 0 0 0-3.25.555.75.75 0 0 0-.5.707v14.25a.75.75 0 0 0 1 .707A8.237 8.237 0 0 1 6 18.75c1.995 0 3.823.707 5.25 1.886V4.533ZM12.75 20.636A8.214 8.214 0 0 1 18 18.75c.966 0 1.89.166 2.75.47a.75.75 0 0 0 1-.708V4.262a.75.75 0 0 0-.5-.707A9.735 9.735 0 0 0 18 3a9.707 9.707 0 0 0-5.25 1.533v16.103Z" />
      </svg>
    )
  },
  {
    label: 'Library',
    path: '/library',
    description: 'Browse, import, and export monsters, creatures, NPCs, and more',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path d="M5.566 4.657A4.505 4.505 0 0 1 6.75 4.5h10.5c.41 0 .806.055 1.183.157A3 3 0 0 0 15.75 3h-7.5a3 3 0 0 0-2.684 1.657ZM2.25 12a3 3 0 0 1 3-3h13.5a3 3 0 0 1 3 3v6a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3v-6ZM5.25 7.5c-.41 0-.806.055-1.184.157A3 3 0 0 1 6.75 6h10.5a3 3 0 0 1 2.683 1.657A4.505 4.505 0 0 0 18.75 7.5H5.25Z" />
      </svg>
    )
  },
  {
    label: 'Join Game',
    path: '/join',
    description: 'Connect to a game hosted by your Dungeon Master',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path
          fillRule="evenodd"
          d="M15.75 2.25H21a.75.75 0 0 1 .75.75v5.25a.75.75 0 0 1-1.5 0V4.81L8.03 17.03a.75.75 0 0 1-1.06-1.06L19.19 3.75h-3.44a.75.75 0 0 1 0-1.5Zm-10.5 4.5a1.5 1.5 0 0 0-1.5 1.5v10.5a1.5 1.5 0 0 0 1.5 1.5h10.5a1.5 1.5 0 0 0 1.5-1.5V10.5a.75.75 0 0 1 1.5 0v8.25a3 3 0 0 1-3 3H5.25a3 3 0 0 1-3-3V8.25a3 3 0 0 1 3-3h8.25a.75.75 0 0 1 0 1.5H5.25Z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    label: 'Bastions',
    path: '/bastions',
    description: 'Manage your strongholds, rooms, and hirelings',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path
          fillRule="evenodd"
          d="M3 2.25a.75.75 0 0 0 0 1.5v16.5h-.75a.75.75 0 0 0 0 1.5H15v-18a.75.75 0 0 0 0-1.5H3ZM6.75 19.5v-2.25a.75.75 0 0 1 .75-.75h3a.75.75 0 0 1 .75.75v2.25a.75.75 0 0 1-.75.75h-3a.75.75 0 0 1-.75-.75ZM6 6.75A.75.75 0 0 1 6.75 6h.75a.75.75 0 0 1 0 1.5h-.75A.75.75 0 0 1 6 6.75ZM6.75 9a.75.75 0 0 0 0 1.5h.75a.75.75 0 0 0 0-1.5h-.75ZM6 12.75a.75.75 0 0 1 .75-.75h.75a.75.75 0 0 1 0 1.5h-.75a.75.75 0 0 1-.75-.75ZM10.5 6a.75.75 0 0 0 0 1.5h.75a.75.75 0 0 0 0-1.5h-.75Zm-.75 3.75A.75.75 0 0 1 10.5 9h.75a.75.75 0 0 1 0 1.5h-.75a.75.75 0 0 1-.75-.75ZM10.5 12a.75.75 0 0 0 0 1.5h.75a.75.75 0 0 0 0-1.5h-.75ZM16.5 6.75v15h5.25a.75.75 0 0 0 0-1.5H21v-12a.75.75 0 0 0 0-1.5h-4.5Zm1.5 4.5a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 0 1.5H18.75a.75.75 0 0 1-.75-.75Zm.75 2.25a.75.75 0 0 0 0 1.5h.008a.75.75 0 0 0 0-1.5H18.75Zm-.75 4.5a.75.75 0 0 1 .75-.75h.008a.75.75 0 0 1 0 1.5H18.75a.75.75 0 0 1-.75-.75Z"
          clipRule="evenodd"
        />
      </svg>
    )
  },
  {
    label: 'About & Data',
    path: '/about',
    description: 'App info, updates, and backup/restore your data',
    icon: (
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6 shrink-0">
        <path
          fillRule="evenodd"
          d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm8.706-1.442c1.146-.573 2.437.463 2.126 1.706l-.709 2.836.042-.02a.75.75 0 0 1 .67 1.34l-.04.022c-1.147.573-2.438-.463-2.127-1.706l.71-2.836-.042.02a.75.75 0 1 1-.671-1.34l.041-.022ZM12 9a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z"
          clipRule="evenodd"
        />
      </svg>
    )
  }
]

export default function MainMenuPage(): JSX.Element {
  const navigate = useNavigate()
  const disconnectReason = useNetworkStore((s) => s.disconnectReason)
  const clearDisconnectReason = useNetworkStore((s) => s.clearDisconnectReason)

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-8 px-4">
      {/* Kick/Ban notification banner */}
      {disconnectReason && (
        <div
          role="alert"
          className={`w-full max-w-md flex items-center justify-between px-4 py-3 rounded-lg border ${
            disconnectReason === 'banned' ? 'bg-red-900/30 border-red-700/50' : 'bg-amber-900/30 border-amber-700/50'
          }`}
        >
          <span className={`text-sm ${disconnectReason === 'banned' ? 'text-red-300' : 'text-amber-300'}`}>
            {disconnectReason === 'kicked'
              ? 'You were kicked from the game by the DM.'
              : 'You were banned from the game by the DM.'}
          </span>
          <button
            onClick={clearDisconnectReason}
            aria-label="Dismiss"
            className={`ml-4 cursor-pointer ${
              disconnectReason === 'banned' ? 'text-red-400 hover:text-red-200' : 'text-amber-400 hover:text-amber-200'
            }`}
          >
            <svg
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="w-4 h-4"
            >
              <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
            </svg>
          </button>
        </div>
      )}

      <div className="text-center">
        <h1 className="text-5xl font-bold tracking-wider text-amber-400 mb-2">D&D Virtual Tabletop</h1>
        <p className="text-gray-400 text-lg">Your adventure awaits</p>
      </div>

      <nav aria-label="Main navigation" className="flex flex-col gap-4 w-full max-w-md mt-8">
        {menuItems.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="group flex items-center gap-4 p-5 rounded-lg border border-gray-800
                       bg-gray-900/50 hover:bg-gray-800/80 hover:border-amber-600/50
                       transition-all duration-200 text-left cursor-pointer"
          >
            <span className="text-gray-500 group-hover:text-amber-500 transition-colors">{item.icon}</span>
            <div>
              <div className="text-xl font-semibold text-gray-100 group-hover:text-amber-400 transition-colors">
                {item.label}
              </div>
              <div className="text-sm text-gray-500 mt-1">{item.description}</div>
            </div>
          </button>
        ))}
      </nav>

      <p className="text-gray-600 text-sm mt-4">
        Version {typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'}
      </p>
    </div>
  )
}
