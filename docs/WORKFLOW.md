Expected Workflow
=================

This describes the experience from a non-technical author using your website and ShareBandit.

1. Author/editor logs in to ShareBandit and *adds* a new URL to test.
2. Author inputs what the final URL will be (where we will redirect visits) and creates multiple "treatments": Headline/Description/ImageLink combinations that will display on facebook shares
3. Author goes into their CMS/website system and marks the page as using ShareBandit for share metadata. (The specific step depends on how your team implemented ShareBandit integration)
4. As users share your page, ShareBandit tests the options and determines how successful
   each option is (after about 100-200 shares).  As one option takes the lead, ShareBandit will make it more likely
   that option is provided, so authors/editors don't have to evaluate real-time- the system automatically adjusts.
5. To track the progress of the algorithm, you can *View Report* on the ShareBandit URL page and see which candidate is winning/has won.

Example Workflow with screenshots
-----------------
The author/editor logs in to ShareBandit, adds a new URL to test, and several treatment options for the URL (treatment options are Headline/Description/ImageLink combinations)
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB1.png )

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB2.png )

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB3.png )

If your tech team gave you the option to mark particular pages as "using ShareBandit", do this next. In our custom petition system, we use tags to enable / disable sharebandit on a per-petition basis. 

When users share the page served by your CMS (petition system in this example) that has been instrumented by you to serve up share links from your installation of sharebandit, your page when shared will be displayed in facebook with one of the "treatments" aka text/description/image combinations that you set up in sharebandit. 

Example: we sign the test petition (the URL we load = the URL we added in ShareBandit admin), and on our petition system's thanks page, there is an option to share the petition.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB7.png )

Here our system has been instrumented to share the link https://share.moveon.org/r/0/petitions.moveon.org/sign/sharebandit-test and sharebandit takes this request and redirects to a particular treatment, like https://share.moveon.org/r/8/petitions.moveon.org/sign/sharebandit-test

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB9.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB10.png )

The first few hundred requests return a treatment at random. But as the bandit algorithm learns and trains, it starts to send back "winning" treatments.

Then when users share this link, they are sharing a particular treatment. You can see we use a private facebook group for testing:
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB11.png )

As other users click on the shared link, they are taken to your target page, and if they take the target action your tech team instrumented to call back to ShareBandit, then your system lets ShareBandit know about the successful action, which then helps the bandit algorithm tune itself to provide even better share metadata recommendations in the future.

Petition example again: users click on this link, are taken to our petition page, and if they sign the petition, our petition server has been instrumented to make a callback to sharebandit letting it know this trial was a success. 

What needs to happen for the callback to be able to work? Special parameters called abver and abid have been added to the URL that need to be passed back to your installation of the ShareBandit server so that it knows what treatment to store results for.

Here's an example of how we make this callback happen when someone signs a petition, using the abver and abid params passed into the petition page URL by the link that was posted on facebook:

1. the sharebandit server shows a treatment (a particular combination of text/description/image) that shows up in a user's facebook feed
1. if a facebook user clicks this link it take them to the URL petitions.moveon.org/sign/sharebandit-test-petition?abid=$abid&abver=$abver
1. on this petition page, if the member then signs the petition, we've instrumented our petition system to make the following callback to our sharebandit server, using the abver and abid params passed to it from facebook: http://share.moveon.org/a/$abver/$petition_share?abid=$abid

After the "success" callback has been made, you can navigate back to the sharebandit admin, and click View Report for a given treatment, and then see a graph of successes for various treatments over time. It will take hundreds of data points for these graphs to become meaningful, but they are intended to show the progress of the algorithm, and how long it took to converge on a winner.

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB13.png )
![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB14.png )

To add data points in this example, you need to take your target action again, and when you do, you should see the graph of successes update accordingly:

![](http://s3.amazonaws.com/s3.moveon.org/share_bandit_docs/SB16.png )
