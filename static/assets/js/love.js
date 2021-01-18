async function love(id, callback) {
    console.log(`loving ${id}`)
    var loveres = await fetch(`/posts/${id}/love`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
        }
    })
    var lovejson = await loveres.json()
    console.log(lovejson)
    if (lovejson.ok) {
        var action = lovejson.action
        var newCount = lovejson.loves
        if (action == 'love') callback(newCount, 'love')
        if (action == 'unlove') callback(newCount, 'unlove')
    }
    if (lovejson.error) {
        Swal.fire({
            icon: 'error',
            title: 'Failed to love',
            text: lovejson.error,
            footer: '<a href="https://github.com/jeffalo/wasteof.money/issues" target="_blank" rel="noopener">Report issues</a>'
        })
    }
}