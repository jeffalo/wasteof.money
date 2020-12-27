var postbutton = document.querySelector('#post-button')
if (postbutton) {
  postbutton.addEventListener('click', async (event) => {
    const { value: text } = await Swal.fire({
      input: 'textarea',
      inputLabel: 'Message',
      inputPlaceholder: 'Type your message here...',
      inputAttributes: {
        'aria-label': 'Type your message here'
      },
      showCancelButton: true
    })

    if (text) {
      post(text)
    }
  })
}


async function post(text) {
  var postres = await fetch('/post', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      post: text
    })
  })
  var postjson = await postres.json()
  console.log(postjson)
  if(postjson.ok){
    document.location.href = `/posts/${postjson.id}`
  }
  if(postjson.error){
    Swal.fire({
      icon: 'error',
      title: 'Failed to post',
      text: postjson.error,
      footer: '<a href="https://github.com/jeffalo/wasteof.money/issues">Report issues</a>'
    })  
  }
}