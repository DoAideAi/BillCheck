import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import App from './App.jsx'

afterEach(cleanup)
globalThis.URL.createObjectURL = () => 'blob:bill'
globalThis.URL.revokeObjectURL = () => {}

describe('BillCheck', () => {
  it('checks the sample bill and flags its wrong line', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Try a sample/))
    expect(screen.getByTestId('summary').textContent).toContain('1 problem found')
    const items = screen.getAllByTestId('item')
    expect(items).toHaveLength(3)
    expect(items[1].querySelector('[data-status]').dataset.status).toBe('error')
    expect(items[1].textContent).toContain('should be ₹120.00')
  })

  it('re-checks when a misread number is corrected', () => {
    render(<App />)
    fireEvent.click(screen.getByText(/Try a sample/))
    const amount = screen.getAllByLabelText('Amount')[1]
    fireEvent.change(amount, { target: { value: '120' } })
    // Fixing the line breaks the subtotal (the bill's own sum used the wrong 130).
    expect(screen.getAllByTestId('item')[1].querySelector('[data-status]').dataset.status).toBe('ok')
    expect(screen.getByTestId('summary').textContent).toContain('1 problem found')
    fireEvent.change(screen.getByLabelText('Subtotal'), { target: { value: '450' } })
    fireEvent.change(screen.getByLabelText('CGST amount'), { target: { value: '11.25' } })
    fireEvent.change(screen.getByLabelText('SGST amount'), { target: { value: '11.25' } })
    fireEvent.change(screen.getByLabelText('Total'), { target: { value: '472.5' } })
    expect(screen.getByTestId('summary').textContent).toContain('All checks passed')
  })

  it('reads an uploaded photo with OCR and shows the text it read', async () => {
    const recognize = vi.fn(async (_blob, progress) => {
      progress({ stage: 'Reading the bill', progress: 0.5 })
      return 'Tea 2 x 20.00 40.00\nTotal 40.00'
    })
    render(<App recognize={recognize} />)
    const input = screen.getByLabelText('Bill photo')
    await act(async () => fireEvent.change(input, { target: { files: [new Blob(['x'], { type: 'image/png' })] } }))
    expect(recognize).toHaveBeenCalledOnce()
    expect(screen.getByTestId('summary').textContent).toContain('could not be checked') // no subtotal printed
    expect(screen.getByTestId('ocr-text').textContent).toContain('Tea 2 x 20.00')
  })

  it('says so when the photo cannot be read', async () => {
    render(<App recognize={() => Promise.reject(new Error('Unsupported image'))} />)
    await act(async () =>
      fireEvent.change(screen.getByLabelText('Bill photo'), { target: { files: [new Blob(['x'])] } }),
    )
    expect(screen.getByRole('alert').textContent).toContain('Unsupported image')
  })
})
