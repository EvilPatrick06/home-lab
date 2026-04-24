import { useNavigate } from 'react-router'

export default function NotFoundPage(): JSX.Element {
  const navigate = useNavigate()

  return (
    <div className="h-screen flex flex-col items-center justify-center bg-gray-950 text-gray-100">
      <div className="text-center">
        <div className="text-6xl mb-4">&#128270;</div>
        <h1 className="text-3xl font-bold mb-2">Page Not Found</h1>
        <p className="text-gray-400 mb-6">The page you're looking for doesn't exist or has been moved.</p>
        <button
          onClick={() => navigate('/')}
          className="px-5 py-2.5 rounded-lg font-semibold bg-amber-600 hover:bg-amber-500
            text-white transition-colors cursor-pointer"
        >
          Return to Menu
        </button>
      </div>
    </div>
  )
}
