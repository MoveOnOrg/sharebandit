How to integrate ShareBandit with a website (programming required)
------------------------------------------------------------------

### The Simplest Integration ###

1. Make some tag/option to 'mark' which of your pages is using a ShareBandit page
2. For those pages:
2.1 Make an og:url META tag in your HEAD element:

    &lt;meta name="og:url" value="http://{{YOUR_SHAREBANDIT_URL}}<b>/r/0/</b>{{URL_FOR_PAGE WITHOUT PROTOCOL}}" />

Example: If your sharebandit instance is at `https://share.example.com` and the URL for the page is
`http://www.example.com/story/the-world-is-burning` Then the tag should be:

    <meta name="og:url" value="https://share.example.com/r/0/www.example.com/story/the-world-is-burning" />

2.2 On any share links to your page, embed the javascript file

    <script src="{{YOUR_SHAREBANDIT_URL}}<b>/js/</b>{{URL_FOR_PAGE WITHOUT PROTOCOL}}" ></script>

Example (same case as above):

    <script src="https://share.example.com/js/www.example.com/story/the-world-is-burning" ></script>

2.3 On the same share links, add `class="sharebandit-fb"`

With `2.2` and `2.3` done, the javascript should replace the `href=""` or `data-href=""` attributes with the ShareBandit share URL in its place.  (See `views/jsshare.html` to review the code that is actually run)

### Deeper integration: Using ShareBandit Based on Actions/Conversions ###

The 'simple' integration above will only trigger ShareBandit based on facebook clicks.
If you are a news/content site, that may be all you want.  However, if there is a subsequent
action or conversion that you want users to take (e.g. donate or sign a petition), then you can have
ShareBandit run based on those actions instead.  After the simple integration, make the following integration changes:

1. Send action events to ShareBandit:
In order for ShareBandit to trigger based on actions, we obviously need to know when that takes place.
When ShareBandit redirects pages from Facebook to your site, it adds two query parameters to the page
`abver` and `abid`  so from the above, example, the page's visit will be something like:

   http://www.example.com/story/the-world-is-burning<b>?abid=123&abver=abc789</b>

In that case, you need to call this URL *after* your conversion action:

   https://share.example.com/a/abc789/www.example.com/story/the-world-is-burning?abid=123

As a template this looks like:

   {{YOUR_SHAREBANDIT_URL}}<b>/a/</b>{{abver}}/{{URL_FOR_PAGE WITHOUT PROTOCOL}}?abid={{abid}}

This URL actually returns a <a href="http://probablyprogramming.com/2009/03/15/the-tiniest-gif-ever">
     super-duper small image file</a> so if you have a 'Thanks'/completion page, you can just include the
     HTML:

   &lt;img src="{{conversion url above}}" width="1" height="1" />


2. Instead of the <b>/js/</b> `script` element in the simple version, replace that URL with <b>/jsaction/</b>
   This will trigger the share links' content based on action conversions rather than clicks.


## api

If you display the share block before a user takes an action (eg. with speakout) you can't only fetch the js that will set your fb share url, but you need to fetch the data matching that variant to be able to display the title, description and image

2 apis select a variant and returns the raw data (optimizing for click or actions, as described above):

    {{YOUR_SHAREBANDIT_URL}}/json/{{URL_FOR_PAGE WITHOUT PROTOCOL}}
    {{YOUR_SHAREBANDIT_URL}}/jsonaction/{{URL_FOR_PAGE WITHOUT PROTOCOL}}

it returns json, and if you add a ?callback=xyz (in jQuery, you can leave xyz empty and it will generate a random one), it returns a jsonp

    {{YOUR_SHAREBANDIT_URL}}/jsonall/{{URL_FOR_PAGE WITHOUT PROTOCOL}}
This does return the list of all the existing variants, without selecting any
