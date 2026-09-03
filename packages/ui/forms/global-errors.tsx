const GlobalErrors = ({ errors }: { readonly errors: readonly string[] }) =>
  errors.length > 0 ? (
    <div
      role='alert'
      aria-live='assertive'
      className='rounded-md border border-destructive/30 bg-destructive/10 p-4 text-destructive'>
      {errors.map((error, index) => (
        <p key={index}>{error}</p>
      ))}
    </div>
  ) : null

export { GlobalErrors }
