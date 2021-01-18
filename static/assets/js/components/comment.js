export default {
  props: {
    comment: {
      type: Object,
      required: true
    }
  },
  template: 
`
<div class="p-4 my-5 bg-white rounded-lg shadow">
    <div class="block align-middle">
        <a :href="'/users/'+comment.poster.name" class="font-normal">
            <img :src="'/picture/'+comment.poster.id" height="30px" class="rounded-full h-6 inline-block shadow" />
            <h4 class="inline-block text-lg text-gray-900 leading-tight ml-1">
                @{{ comment.poster.name }}
            </h4>
        </a>
        <span class="inline-block ml-2 text-base text-gray-500 italic leading-normal">
            {{ new Date(comment.time).toLocaleDateString("en-US") + " " + new Date(comment.time).toLocaleTimeString("en-US") }}
        </span>
    </div>
    <p class="text-base text-gray-600 leading-normal wasteof-break-words block">
        {{ comment.content }}
    </p>
</div>
`
}
