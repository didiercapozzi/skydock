const EmptyManifest = () => {
  return (
    <main className='min-h-screen bg-gradient-to-br from-gray-50 via-gray-50 to-gray-100'>
      <div className='max-w-7xl mx-auto px-6 py-8'>
        <h1 className='text-3xl font-bold text-gray-900'>No Manifest Found</h1>
        <p className='text-gray-500 mt-2'>Run a scan to generate the manifest.</p>
      </div>
    </main>
  )
}

export { EmptyManifest }
