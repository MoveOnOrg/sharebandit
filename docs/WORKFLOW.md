Expected Workflow
=================

This describes the experience from a non-technical author using your website and ShareBandit.

1. The author/editor logs in to ShareBandit and *adds* a new URL to test.
1.1  They input what the final URL will be (where we will redirect visits)
1.2  They create multiple "treatments": Headline/Description/ImageLink combinations
2. Author goes into your CMS/website system and marks the page somehow as using ShareBandit.
3. After publishing, as users share your page, ShareBandit tests the options and determines how successful
   each one is (after about 100-200 shares).  As one takes the lead, ShareBandit will make it more likely
   that that candidate is tried, so you don't have to evaluate real-time, and you can let the system do that.
4. As shares come in, you can *View Report* on the ShareBandit URL page and see which candidate is winning/has won.

Example Workflow with screenshots
-----------------
The author/editor logs in to ShareBandit, adds a new URL to test, and several treatment options for the URL (treatment options are Headline/Description/ImageLink combinations)
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB1.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB2.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB3.png )

Assuming your tech folks have instrumented your CMS to use sharebandit (where use = your CMS's facebook share metadata points to your installation of the ShareBandit server), you may want to implement the ability to selectively use ShareBandit on a per-page basis. In our custom petition system, we use tags to enable / disable sharebandit on a per-petition basis. 

If you have done this, the author will need to mark the desired page as using sharebandit in your CMS. This step will be specific to the system that is using sharebandit.

When users share the page served by your CMS that has been instrumented by you to serve up share links from your installation of sharebandit, your share page gets one of the treatments you set up in sharebandit. In this example, our CMS is our petition system. So to demonstrate, we sign the test petition (the URL we load = the URL we added in ShareBandit admin), and on our petition system's thanks page, there is an option to share the petition.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB7.png )

Here our system has been instrumented to share the link https://share.moveon.org/r/0/petitions.moveon.org/sign/sharebandit-test and sharebandit takes this request and redirects to a particular treatment, like https://share.moveon.org/r/8/petitions.moveon.org/sign/sharebandit-test

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB9.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB10.png )

The first few hundred requests return a treatment at random. But as the bandit algorithm learns and trains, it starts to send back "winning" treatments.

Then when users share this link, they are sharing a particular treatment. You can see we use a private facebook group for testing:
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB11.png )

Other users can then click on this link, are taken to our petition page, and if they sign the petition, our petition server has been instrumented to make a callback to sharebandit letting it know this trial was a success. The implementation of how and when to make the "success" callback will depend on the system integrating with sharebandit, and is an important choice point for the implementer.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB12.png )

Here's an example of how we make this callback on petition signature, using the abver and abid params passed into the petition page URL by the link that was posted on facebook:

1. the sharebandit server shows a share metadata treatment that shows up in a user's facebook feed
1. if a facebook user clicks this link it take them to the URL petitions.moveon.org/sign/sharebandit-test-petition?abid=$abid&abver=$abver
1. on this petition page, if the member then signs the petition, we've instrumented our petition system to make the following callback to our sharebandit server, using the abver and abid params passed to it from facebook:


```perl
http://share.moveon.org/a/$abver/$petition_share?abid=$abid
```

After the "success" callback has been made, you can navigate back to the sharebandit admin, and click View Report for a given treatment, and then see a graph of successes for various treatments over time. It will take hundreds of data points for these graphs to become meaningful, but they are intended to show the progress of the algorithm, and how long it took to converge on a winner.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB13.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB14.png )

To add data points in this example, you need to sign this same petition again (with a different email address, in our system) to get a potentially different share treatment (remember that this is chosen at random at first):

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB16.png )
