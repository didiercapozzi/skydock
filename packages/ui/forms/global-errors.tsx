const GlobalErrors = ({ errors }: { readonly errors: readonly string[] }) =>
  errors.length > 0 ? (
    <div
      role='alert'
      aria-live='assertive'
      className='rounded-corner bg-destructive/10 px-2.5 py-2 text-small text-destructive'>
      {errors.map((error, index) => (
        <p key={index}>{error}</p>
      ))}
    </div>
  ) : null

export { GlobalErrors }
