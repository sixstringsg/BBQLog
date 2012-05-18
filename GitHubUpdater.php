<?php

function esc($txt) {
  return mysql_real_escape_string($txt);
}

function actionDone($msg) {
	global $startTime;	
	echo "$msg (" . number_format(floatval(microtime(true) - $startTime), 5) . "s) <br />";
	$startTime = microtime(true);
	flush_buffers();
}
function actionStart($msg) {
	echo $msg . "<br />";
}
function flush_buffers(){
    ob_flush();
    flush();
}

ob_start();


mysql_connect($CFG['SQL']['Host'], $CFG['SQL']['User'], $CFG['SQL']['Pass']) or die(mysql_error());
mysql_select_db($CFG['SQL']['DB']) or die(mysql_error());


$startTime = microtime(true);

// Temp - Import tables
actionStart("Starting repositories processing...");

$repositories = mysql_query("SELECT DISTINCT * FROM repositories GROUP BY GitUsername,Repository;") or die(mysql_error());

while ($repo = mysql_fetch_assoc($repositories)) {
	// load last commit of the branch
	$branches_json = json_decode(file_get_contents("https://api.github.com/repos/".$repo['GitUsername']."/".$repo['Repository']."/branches"), true);
	
	$branches_sql = mysql_query("SELECT Branch FROM repositories WHERE GitUsername='".mysql_real_escape_string($repo['GitUsername'])."' AND Repository='".mysql_real_escape_string($repo['Repository'])."'");
	
	while ($branch = mysql_fetch_assoc($branches_sql)) {
		// find the last commit
		$lastCommitSHA = "";
		
		foreach($branches_json as $gitBranch) {
			if ($gitBranch['name'] == $branch['Branch']) {
				$lastCommitSHA = $gitBranch['commit']['sha'];
				echo "Found branch " . $branch['Branch'] . " (last commit: $lastCommitSHA)<br>";
				break;
			}
		}
		
		// get the last commit in db
		$query = mysql_query("SELECT SHA FROM commits WHERE GitUsername='".esc($repo['GitUsername'])."' AND Repository='".esc($repo['Repository'])."' AND Branch='".esc($branch['Branch'])."' ORDER BY CommitDate DESC LIMIT 1");
		
		$fetch = mysql_fetch_assoc($query);
		
		$lastCommitDB = $fetch['SHA'];
		
		if ($lastCommitSHA == $lastCommitDB) {
			// the last commit in DB is already the latest one of the branch, skipping
			continue;
		}
	
		actionStart("Fetching branch " . $branch['Branch'] . " of repo " . $repo['Repository'] . "...");
		$commitSHA = $lastCommitSHA;
		$nbFetched = 0;
		while (true) {
			if ($nbFetched == 20) // we limit max 20 requests per branch (thats 2000 commits)
				break;
			
			actionStart("Grabbing https://api.github.com/repos/".$repo['GitUsername']."/".$repo['Repository']."/commits?per_page=100&sha=$commitSHA ...");
			
			$commits_json = json_decode(file_get_contents("https://api.github.com/repos/".$repo['GitUsername']."/".$repo['Repository']."/commits?per_page=100&sha=$commitSHA"),true);
			
			echo "(".count($commits_json)." commits)<br>";
			
			$lastReached = false;
			
			foreach($commits_json as $commit) {
				if ($commit['sha'] == $lastCommitDB) {
					$lastReached = true;
					break;
				}
				
				mysql_query("INSERT IGNORE INTO commits(SHA,GitUsername,Repository,Branch,Author,Message,CommitDate) VALUES('" . esc($commit['sha']) ."', '".esc($repo['GitUsername'])."' ,'".esc($repo['Repository'])."', '".esc($branch['Branch'])."', '".esc($commit['committer']['login'])."', '".esc($commit['commit']['message'])."', '".esc($commit['commit']['author']['date'])."');") or die(mysql_error());
				
				$commitSHA = $commit['sha'];
			}
			
			if ($lastReached)
				break;
				
			actionDone("Commits batch imported");
			$nbFetched++;
		}
		
		actionDone("Done fetching branch " . $branch['Branch'] . " of repo " . $repo['Repository'] . "...");
	}  
}

actionDone("Commits updated");/*
actionStart("Dumping commits...");

$commits = mysql_query("SELECT * FROM commits;")  or die(mysql_error());

while ($commit = mysql_fetch_assoc($commits)) {
  print_r($commit);
}*/


?>