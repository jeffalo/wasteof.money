export default {
	props: {
		post: {
			type: Object,
			required: true
		},
		dontLink: {
			type: Boolean
		},
		loggedInUserId: {}
	},
	methods: {
		onclick() { this.$parent.lovePost(this.post._id) },
		async deletePost() {
			var deleteRes = await fetch(`/posts/${this.post._id}`, {
				method: 'DELETE',
				headers: {
					'X-Requested-With': 'XMLHttpRequest'
				}
			})
			var deleteJSON = await deleteRes.json()
			console.log(deleteJSON)
			if (deleteJSON.ok) {
				document.location.href = '/'
			}
			if (deleteJSON.error) {
				Swal.fire({
					icon: 'error',
					title: 'Failed to delete post',
					text: deleteJSON.error,
					footer: '<a href="https://github.com/jeffalo/wasteof.money/issues" target="_blank" rel="noopener">Report issues</a>'
				})
			}
		}
	},
	computed: {
		postIdInfo() {
			return new Date(this.post.time).toLocaleDateString("en-US") + " " + new Date(this.post.time).toLocaleTimeString("en-US") + " - " + this.post._id
		}
	},
	template:
`
<div class="max-w-2xl flex p-6 mx-auto my-5 bg-white rounded-lg shadow-md" :class="{'bg-indigo-100': post.highlight}">
	<div class="pt-1 w-full">
		<a :href="'/users/'+post.poster.name" class="font-normal">
			<img :src="'/picture/' + post.poster.id" height="30px" class="rounded-full h-6 inline-block shadow"/>
			<h4 class="inline-block text-xl text-gray-900 leading-tight align-middle ml-1">
				@{{ post.poster.name }}
			</h4>
		</a>
		<component :is="dontLink? 'span' : 'a'" :href="'/posts/'+post._id" class="font-normal text-black w-full">
			<p class="text-base text-gray-500 leading-normal wasteof-break-words whitespace-pre-line">{{ post.content }}</p>
			<p class="text-base text-gray-500 italic leading-normal">
				{{ postIdInfo }}
			</p>
		</component>
		<div>
			<span
				@click="onclick"
				tabindex="0"
				:class="{love: true, 'text-red-600': post.loves.includes(loggedInUserId)}">
			<span :data-post-id="post._id" class="iconify inline-block hover:text-red-400 transition-color duration-200 cursor-pointer" data-icon="uil:heart" data-inline="true"></span>
			</span>
			<span :data-post-count-id="post._id">{{ post.loves.length }}</span>
			<span v-if="post.poster.id == loggedInUserId" @click="deletePost" tabindex="0">
				<span :data-post-id="post._id" class="iconify inline-block hover:text-red-400 transition-color duration-200 cursor-pointer float-right" data-icon="uil:trash" data-inline="true"></span>
			</span>
		</div>
	</div>
</div>
`
}
