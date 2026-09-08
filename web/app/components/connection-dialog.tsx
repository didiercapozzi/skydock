import { useState } from 'react'

type ConnectionDialogProps = {
  onConnect: (host: string, user: string, password: string) => void
  onCancel: () => void
  error?: string
}

const ConnectionDialog = ({ onConnect, onCancel, error }: ConnectionDialogProps) => {
  const [host, setHost] = useState('')
  const [user, setUser] = useState('')
  const [password, setPassword] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (host && user && password) onConnect(host, user, password)
  }

  return (
    <div className='fixed inset-0 z-50 flex items-center justify-center bg-black/50'>
      <div className='bg-white rounded-xl shadow-xl p-6 w-full max-w-md'>
        <h2 className='text-lg font-semibold text-gray-900 mb-4'>Connect to NAS</h2>
        {error && (
          <div className='mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700'>
            {error}
          </div>
        )}
        <form
          onSubmit={handleSubmit}
          className='space-y-4'>
          <div>
            <label
              htmlFor='host'
              className='block text-sm font-medium text-gray-700 mb-1'>
              NAS Hostname
            </label>
            <input
              id='host'
              type='text'
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder='https://nas.local:5001'
              className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              required
            />
          </div>
          <div>
            <label
              htmlFor='user'
              className='block text-sm font-medium text-gray-700 mb-1'>
              Username
            </label>
            <input
              id='user'
              type='text'
              value={user}
              onChange={(e) => setUser(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              required
            />
          </div>
          <div>
            <label
              htmlFor='password'
              className='block text-sm font-medium text-gray-700 mb-1'>
              Password
            </label>
            <input
              id='password'
              type='password'
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500'
              required
            />
          </div>
          <div className='flex justify-end gap-3 pt-2'>
            <button
              type='button'
              onClick={onCancel}
              className='px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200'>
              Cancel
            </button>
            <button
              type='submit'
              className='px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700'>
              Connect
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export { ConnectionDialog }
