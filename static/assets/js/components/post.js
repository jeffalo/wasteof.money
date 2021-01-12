export default {
	props: {
		post: {
			type: Object,
			required: true
		},
		loggedInUserID: {}
	},
	render(h) {
		let post = this.post;
		return h(
			"div", {
				class: {
					"max-w-2xl": true,
					"flex": true,
					"p-6": true,
					"mx-auto": true,
					"my-5": true,
					"bg-white": true,
					"rounded-lg": true,
					"shadow-md": true,
					"bg-indigo-100": this.post.highlight
				}
			},
			[
				h("div", {
					class: "pt-1"
				}, [
					h("img", {
						attrs: {
							src: "/picture/" + this.post.posterID,
							height: "30px",
						},
						class: ["rounded-full", "h-6", "inline-block", "shadow"]
					}),
					h(
						"h4", {
							class: [
								"inline-block",
								"text-xl",
								"text-gray-900",
								"leading-tight",
								"align-middle",
								"ml-1"
							]
						},
						"@" + this.post.poster
					),
					h(
						"p", {
							class: ["text-base", "text-gray-600", "leading-normal"]
						},
						this.post.content
					),
					h(
						"p", {
							class: ["text-base", "text-gray-500", "italic", "leading-normal"]
						},
						new Date(this.post.time).toLocaleDateString("en-US") +
						" " +
						new Date(this.post.time).toLocaleTimeString("en-US") +
						" - " +
						this.post._id
					),
					h("div", [
						h("span", {
							on: {
								click: () => this.$parent.lovePost(this.post._id) // we have to keep this as a function otherwise it will fire on page load and then not work.
							},
							attrs: {
								tabindex: 0
							},
							class: {
								love: true,
									"text-red-600": this.post.loves.includes(this.loggedInUserID)
							},
							domProps: {
								innerHTML: `<span data-post-id="${this.post._id}"
                              class="iconify inline-block hover:text-red-400 transition-color duration-200 cursor-pointer"
                              data-icon="uil:heart" data-inline="true"></span>`
							}
						}),
						h(
							"span", {
								attrs: {
									"data-post-count-id": this.post._id
								},
								class: ["ml-1"]
							},
							this.post.loves.length
						)
					])
				])
			]
		);
	}
};