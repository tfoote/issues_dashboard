/**
 * Provider incorporating GitHub issues
 * into the issues dashboard.
 *
 * Copyright (c) 2013, Dirk Thomas
 * Distributed under the BSD 2-Clause license
 * httpss://github.com/dirk-thomas/issues_dashboard/
 **/

(function(namespace, github_namespace, issues_dashboard_namespace) {

  namespace.GitHubModel = Backbone.Model.extend({
    initialize: function() {
      console.debug('GitHubModel.initialize()');
    },
    login: function (options) {
      console.debug('GitHubModel.login()');
      options.debug = debug;
      var github = new github_namespace.GitHub(options);
      var self = this;
      github.user(function(err, res) {
        if (err) {
          console.error('GitHubModel.login() failed: ' + err);
          self.clear();
          self.trigger('login_failed', err);
        } else {
          console.log('GitHubModel.login() succeeded for user: ' + res.login);
          self.set({github: github, user: res});
          self.trigger('logged_in', github);
        }
      });
    },
    logout: function() {
      console.log('GitHubModel.logout()');
      this.clear();
      this.trigger('logged_out');
    },
  });


  namespace.LoginView = Backbone.View.extend({
    tagName: 'div',
    className: 'login github_login',
    events: {
      'click .login_button': 'login',
      'click .hide_button': 'hide',
      'change .github_authtype': 'autotype_changed',
      'change .github_username': 'login_data_changed',
      'change .github_password': 'login_data_changed',
      'change .github_token': 'login_data_changed',
    },
    initialize: function(github_model) {
      console.debug('LoginView.initialize()');
      this.github_model = github_model;
      this.listenTo(this.github_model, 'login_failed', this.login_failed);
      this.listenTo(this.github_model, 'logged_in', this.hide);
    },
    render: function() {
      console.debug('LoginView.render()');
      var user = this.github_model.get('user');
      if (!user) {
        console.debug('LoginView.render() not logged in');
        var tmpl = _.template($("#github-login-form").html());
        this.$el.html(tmpl());
        this.autotype_changed();
      } else {
        this.hide();
      }
      return this;
    },
    show: function(event) {
      if (event) {
        event.preventDefault();
      }
      this.render();
      this.$el.show();
    },
    hide: function(event) {
      if (event && event.preventDefault) {
        event.preventDefault();
      }
      this.$el.hide();
      this.$el.html('');
    },
    login_failed: function(err) {
      console.debug('LoginView.login_failed()');
      this.$('.login_failed').show();
    },
    autotype_changed: function() {
      console.debug('LoginView.autotype_changed()');
      if (this.$('.github_authtype').val() == 'oauth') {
        this.$('.github_username').hide();
        this.$('.github_password').hide();
        this.$('.github_token').show();
      } else {
        this.$('.github_username').show();
        this.$('.github_password').show();
        this.$('.github_token').hide();
      }
      this.$('.login_failed').hide();
    },
    login_data_changed: function() {
      this.$('.login_failed').hide();
    },
    login: function(event) {
      if (event) {
        event.preventDefault();
      }
      console.debug('LoginView.login()');
      this.github_model.login({
        auth: this.$('.github_authtype').val(),
        token: this.$('.github_token').val(),
        username: this.$('.github_username').val(),
        password: this.$('.github_password').val(),
      });
    },
  });


  namespace.StatusView = Backbone.View.extend({
    tagName: 'div',
    className: 'status',
    events: {
      'click .login_button': 'login',
      'click .logout_button': 'logout',
    },
    initialize: function(github_model, login_view) {
      console.debug('StatusView.initialize()');
      this.github_model = github_model;
      this.login_view = login_view;
      this.listenTo(this.github_model, 'change', this.render);
    },
    render: function() {
      console.debug('StatusView.render()');
      var user = this.github_model.get('user');
      if (!user) {
        console.debug('StatusView.render() not logged in');
        var tmpl = _.template($("#github-status-not-logged-in").html());
        this.$el.html(tmpl());
      } else {
        console.debug('StatusView.render() user: ' + user.name);
        var tmpl = _.template($("#github-status-logged-in").html());
        this.$el.html(tmpl(user));
      }
      return this;
    },
    login: function(event) {
      event.preventDefault();
      this.login_view.show();
    },
    logout: function(event) {
      event.preventDefault();
      this.github_model.logout();
    },
  });


  var query_repo_issues = function(github, full_name, user, issue_collection, complete_callback) {
    console.debug('query_repo_issues()');
    github.repoIssues(full_name, function(err, res) {
      if (err) {
        console.error('query_repo_issues() err code: ' + err);
        if (complete_callback) {
          complete_callback();
        }
      } else {
        var models = [];
        _(res).each(function(issue) {
          console.debug('query_repo_issues() add issue: #' + issue.number);
          function iso8601toDate(value) {
            var regexp_string = /(\d\d\d\d)(-)?(\d\d)(-)?(\d\d)(T)?(\d\d)(:)?(\d\d)(:)?(\d\d)(\.\d+)?(Z|([+-])(\d\d)(:)?(\d\d))/;
            var regexp = new RegExp(regexp_string);
            if (!value.toString().match(regexp)) {
              console.error('iso8601toDate() can not parse timestamp: ' + value);
              return value;
            }
            var date = new Date();
            var d = value.match(regexp);
            date.setUTCDate(1);
            date.setUTCFullYear(parseInt(d[1], 10));
            date.setUTCMonth(parseInt(d[3], 10) - 1);
            date.setUTCDate(parseInt(d[5], 10));
            date.setUTCHours(parseInt(d[7], 10));
            date.setUTCMinutes(parseInt(d[9], 10));
            date.setUTCSeconds(parseInt(d[11], 10));
            if (d[12]) {
              date.setUTCMilliseconds(parseFloat(d[12]) * 1000);
            } else {
              date.setUTCMilliseconds(0);
            }
            if (d[13] != 'Z') {
              var offset = (d[15] * 60) + parseInt(d[17], 10);
              offset *= ((d[14] == '-') ? -1 : 1);
              date.setTime(date.getTime() - offset * 60 * 1000);
            }
            return date;
          }
          var data = {
            id: issue.id,
            number: issue.number,
            title: issue.title,
            issue_url: issue.html_url,
            creator: issue.user.login,
            assignee: issue.assignee ? issue.assignee.login : null,
            assignee_is_me: issue.assignee ? issue.assignee.login == user.login : false,
            pull_request: issue.pull_request ? issue.pull_request.html_url : null,
            updated_at: iso8601toDate(issue.updated_at),
            labels: [],
          };
          _(issue.labels).each(function(label) {
            data.labels.push({
              label: label.name,
              color: label.color,
            });
          });
          //issue_collection.add(new issues_dashboard_namespace.IssueModel(data), {merge: true});
          models.push(new issues_dashboard_namespace.IssueModel(data));
        });
        issue_collection.set(models);
        if (complete_callback) {
          complete_callback();
        }
      }
    }, this);
  };


  var convert_repo_data = function(repo) {
    return {
      id: repo.id,
      name: repo.name,
      full_name: repo.full_name,
      repo_url: repo.html_url,
      open_issues_url: repo.html_url + '/issues?milestone=none&state=open',
      open_issue_count: repo.open_issues,
      is_starred: false,
    };
  };

  var query_user_repos = function(github, group_model, repository_collection, complete_callback) {
    console.debug('query_user_repos()');
    github.userRepos(function(err, res) {
      if (err) {
        console.error('query_user_repos() err code: ' + err);
        if (complete_callback) {
          complete_callback();
        }
      } else {
        // order user repos alphabetically (not supported by the GitHub API)
        // since we want to use collection.set()
        function compare_by_property_name(a, b) {
          a = a.name.toLowerCase();
          b = b.name.toLowerCase();
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        }
        res.sort(compare_by_property_name);

        var models = [];
        _(res).each(function(repo) {
          if (repo.has_issues) {
            console.debug('query_user_repos() add repo: ' + repo.full_name);
            var data = convert_repo_data(repo);
            if (group_model.get('starred_repos').indexOf(data.name) != -1) {
              data.is_starred = true;
            }
            //repository_collection.add(new issues_dashboard_namespace.RepositoryModel(data), {merge: true});
            models.push(new issues_dashboard_namespace.RepositoryModel(data));
          } else {
            console.debug('query_user_repos() skip repo without issue tracker: ' + repo.full_name);
          }
        });
        repository_collection.set(models);
        if (complete_callback) {
          complete_callback();
        }
      }
    }, this);
  };

  var query_org_repos = function(github, org_model, repository_collection, complete_callback) {
    console.debug('query_org_repos()');
    org_name = org_model.get('name');
    github.orgRepos(org_name, function(err, res) {
      if (err) {
        console.error('query_org_repos() err code: ' + err);
        if (complete_callback) {
          complete_callback();
        }
      } else {
        // manually order org repos alphabetically (not supported by the GitHub API)
        // since we want to use collection.set()
        function compare_by_property_name(a, b) {
          a = a.name.toLowerCase();
          b = b.name.toLowerCase();
          if (a < b) return -1;
          if (a > b) return 1;
          return 0;
        }
        res.sort(compare_by_property_name);

        var models = [];
        _(res).each(function(repo) {
          if (repo.has_issues) {
            console.debug('query_org_repos() add repo: ' + repo.full_name);
            var data = convert_repo_data(repo);
            if (org_model.get('starred_repos').indexOf(data.name) != -1) {
              data.is_starred = true;
            }
            //repository_collection.add(new issues_dashboard_namespace.RepositoryModel(data), {merge: true});
            models.push(new issues_dashboard_namespace.RepositoryModel(data));
          } else {
            console.debug('query_org_repos() skip repo without issue tracker: ' + repo.full_name);
          }
        });
        repository_collection.set(models);
        if (complete_callback) {
          complete_callback();
        }
      }
    }, this);
  };


  var query_groups = function(github, user, group_collection) {
    console.debug('query_groups()');
    github.orgs(function(err, res) {
      if (err) {
        console.error('query_groups() err code: ' + err);
      } else {
        github.starredRepos(function(err, res_starred) {
          if (err) {
            console.error('query_groups() err code for starred repos: ' + err);
          } else {
            console.debug('query_groups() add user group');
            var data = {
              id: user.id,
              login: user.login,
              name: user.login,
              avatar_url: user.avatar_url,
            };
            res.push(data);

            // manually order orgs (and user) alphabetically (not supported by the GitHub API)
            // since we want to use collection.set()
            function compare_by_property_login(a, b) {
              a = a.login.toLowerCase();
              b = b.login.toLowerCase();
              if (a < b) return -1;
              if (a > b) return 1;
              return 0;
            }
            res.sort(compare_by_property_login);

            function get_starred_repos(res_starred, group_name) {
              console.debug('get_starred_repos() for group: ' + group_name);
              repos = [];
              _(res_starred).each(function(repo) {
                if (repo.full_name.indexOf(group_name + '/') == 0) {
                  console.debug('get_starred_repos() add starred repo: ' + repo.name);
                  repos.push(repo.name);
                }
              });
              return repos;
            }

            var models = [];
            _(res).each(function(group) {
              console.debug('query_groups() add group: ' + group.login);
              var data = {
                id: group.id,
                name: group.login,
                avatar_url: group.avatar_url,
                starred_repos: get_starred_repos(res_starred, group.login),
              };
              //group_collection.add(new issues_dashboard_namespace.GroupModel(data), {merge: true});
              models.push(new issues_dashboard_namespace.GroupModel(data));
            });
            group_collection.set(models);
          }
        }, this);
      }
    }, this);
  };


  namespace.DashboardView = Backbone.View.extend({
    tagName: 'div',
    className: 'github',
    initialize: function(github_model) {
      console.debug('DashboardView.initialize()');
      this.github_model = github_model;

      function _query_groups(group_collection) {
        console.debug('_query_groups()');
        var github = github_model.get('github');
        var user = github_model.get('user');
        query_groups(github, user, group_collection);
      }

      function _query_group_repos(model, repository_collection, complete_callback) {
        console.debug('_query_group_repos()');
        var github = github_model.get('github');
        var group = model.get('name');
        var user = github_model.get('user');
        if (group == user.login) {
          query_user_repos(github, model, repository_collection, complete_callback);
        } else {
          query_org_repos(github, model, repository_collection, complete_callback);
        }
      }

      function _query_repo_issues(model, issue_collection, complete_callback) {
        console.debug('_query_repo_issues()');
        var github = github_model.get('github');
        var full_name = model.get('full_name');
        var user = github_model.get('user');
        query_repo_issues(github, full_name, user, issue_collection, complete_callback);
      }

      this.group_collection = new issues_dashboard_namespace.GroupCollection();
      this.group_list_view = new issues_dashboard_namespace.GroupListView({
        collection: this.group_collection,
        query_groups: _query_groups,
        query_group_repos: _query_group_repos,
        query_repo_issues: _query_repo_issues,
      });
      this.$el.append(this.group_list_view.render().el);

      this.listenTo(this.github_model, 'logged_in', this.logged_in);
      this.listenTo(this.github_model, 'logged_out', this.logged_out);
    },
    set_filter_model: function(filter_model) {
      this.group_list_view.set_filter_model(filter_model);
    },
    render: function() {
      console.debug('DashboardView.render()');
      return this;
    },
    logged_in: function() {
      console.debug('DashboardView.logged_in()');
      this.group_list_view.query_groups();
    },
    logged_out: function() {
      console.debug('DashboardView.logged_out()');
      this.group_collection.reset();
    },
  });


  namespace.GitHubProvider = function() {
    this.github_model = new namespace.GitHubModel();
    this.login_view = new namespace.LoginView(this.github_model);
    this.status_view = new namespace.StatusView(this.github_model, this.login_view);
    this.dashboard_view = new namespace.DashboardView(this.github_model);

    this.login = function(options) {
      console.debug('GitHubProvider.login()');
      this.github_model.login(options);
    };

    this.get_name = function() {
      return 'GitHub';
    };

    this.get_status_view = function() {
      return this.status_view;
    };

    this.get_login_view = function() {
      return this.login_view;
    };

    this.get_dashboard_view = function() {
      return this.dashboard_view;
    };
  };

})(window.github_provider = window.github_provider || {}, window.github, window.issues_dashboard);
